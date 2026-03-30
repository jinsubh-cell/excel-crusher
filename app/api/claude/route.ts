import { NextRequest } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { SheetData, CellValue, SheetOp } from '@/types'

export const maxDuration = 60

const SYSTEM_PROMPT = `당신은 엑셀 데이터 처리 전문가입니다.

⚠️ 반드시 JSONL 형식으로 응답하세요. 각 줄에 정확히 하나의 JSON 객체. 마크다운 없이 순수 JSONL만 출력하세요.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 방식 A: 연산 명세 (원본 데이터 변환 작업)
행 삭제, 열 교환, 정렬, 필터링, 열 이름 변경 등 원본 시트 수정에 사용합니다.

{"type":"log","message":"처리 설명 (한국어)"}
{"type":"op","sheet":"시트명","op":"swap_cols","col_a":1,"col_b":2}
{"type":"op","sheet":"시트명","op":"delete_rows_where","col":1,"value":"김나래","match":"exact"}
{"type":"op","sheet":"시트명","op":"sort_rows","col":2,"order":"asc"}
{"type":"done","summary":"완료 요약"}

지원 연산 목록:
- swap_cols:          {"op":"swap_cols","col_a":열번호,"col_b":열번호}
- delete_rows_where:  {"op":"delete_rows_where","col":열번호,"value":"삭제값","match":"exact"|"contains"}
- filter_keep:        {"op":"filter_keep","col":열번호,"value":"유지값","match":"exact"|"contains"}
- sort_rows:          {"op":"sort_rows","col":열번호,"order":"asc"|"desc"}
- rename_col:         {"op":"rename_col","col":열번호,"new_name":"새이름"}
- delete_col:         {"op":"delete_col","col":열번호}
- move_col:           {"op":"move_col","from_col":열번호,"to_col":열번호}

열 번호는 0부터 시작합니다: A열=0, B열=1, C열=2, D열=3 ...

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 방식 B: 새 데이터 출력 (새 시트 생성, 요약, 통계, 피벗 등)
기존 데이터를 기반으로 새로운 계산 결과 시트를 만들 때만 사용합니다.

{"type":"log","message":"처리 설명"}
{"type":"sheet","name":"시트명","data":[["헤더1","헤더2"],[값1,값2]],"valueData":[["헤더1","헤더2"],[계산값1,계산값2]]}
{"type":"done","summary":"완료 요약"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 방식 C: 대화 응답 (분석, 설명, 질문 답변)
데이터 조작이 필요 없고 설명이나 분석 결과를 텍스트로 제공할 때 사용합니다.

{"type":"log","message":"분석 중..."}
{"type":"message","text":"분석 결과나 답변 내용을 여기에 작성합니다. 마크다운 형식 사용 가능."}
{"type":"done","summary":"분석 완료"}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
## 판단 기준:
- 원본 시트의 행/열 수정 → 방식 A
- 새 요약/통계 시트 생성 → 방식 B
- 데이터 분석/설명/질문 답변 → 방식 C
- 방식 A 처리 후 done 출력하면 완료 (데이터 재출력 불필요)
`

const MODELS = [
  'claude-sonnet-4-5',
  'claude-3-7-sonnet-20250219',
  'claude-3-5-sonnet-20241022',
  'claude-3-5-haiku-20241022',
  'claude-haiku-4-5',
  'claude-3-opus-20240229',
  'claude-3-haiku-20240307',
]

export async function POST(req: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      const send = (obj: object) => {
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`))
        } catch {
          // controller already closed
        }
      }

      try {
        const apiKey = process.env.CLAUDE_API_KEY
        if (!apiKey) {
          send({ type: 'error', error: 'CLAUDE_API_KEY 환경변수가 설정되지 않았습니다.' })
          controller.close()
          return
        }

        const body = await req.json()
        const { command, sheets } = body as { command: string; sheets: SheetData[] }

        if (!command?.trim()) {
          send({ type: 'error', error: '명령을 입력해 주세요.' })
          controller.close()
          return
        }
        if (!sheets?.length) {
          send({ type: 'error', error: '엑셀 파일을 먼저 업로드해 주세요.' })
          controller.close()
          return
        }

        send({ type: 'progress', message: 'Claude AI 처리 시작...' })

        const anthropic = new Anthropic({ apiKey })

        const sheetsJson = JSON.stringify(sheets)
        const MAX = 300000
        const truncated = sheetsJson.length > MAX
        const dataStr = truncated
          ? JSON.stringify(sheets.map((s) => ({ ...s, data: s.data.slice(0, 800) }))) +
            '\n[데이터 일부만 전송됨. 연산 명세(방식 A) 사용 권장]'
          : sheetsJson

        const userMsg = `엑셀 데이터:\n${dataStr}\n\n명령: ${command}${
          truncated ? '\n\n[일부 데이터만 전송됨 — 방식 A(연산 명세)를 사용해주세요]' : ''
        }`

        const envModel = process.env.CLAUDE_MODEL
        const modelsToTry = envModel
          ? [envModel, ...MODELS.filter((m) => m !== envModel)]
          : MODELS

        // 스트리밍 결과 수집
        const resultSheets: SheetData[] = []
        const resultSheetsValueOnly: SheetData[] = []
        const pendingOps: SheetOp[] = []
        const collectedMessages: string[] = []
        const logs: string[] = []
        let summary = ''
        let fullText = ''
        let usedModel = ''

        const processLine = (line: string) => {
          const trimmed = line.trim()
          if (!trimmed) return
          try {
            const obj = JSON.parse(trimmed) as {
              type: string
              message?: string
              text?: string
              // op fields
              op?: string
              sheet?: string
              col?: number
              col_a?: number
              col_b?: number
              from_col?: number
              to_col?: number
              value?: string
              match?: 'exact' | 'contains'
              order?: 'asc' | 'desc'
              new_name?: string
              // sheet fields
              name?: string
              data?: CellValue[][]
              valueData?: CellValue[][]
              summary?: string
            }

            if (obj.type === 'log' && obj.message) {
              logs.push(obj.message)
              send({ type: 'progress', message: obj.message })

            } else if (obj.type === 'message' && obj.text) {
              // 방식 C: 대화 응답
              collectedMessages.push(obj.text)
              send({ type: 'progress', message: `💬 응답 생성 중...` })

            } else if (obj.type === 'op' && obj.op && obj.sheet) {
              const operation: SheetOp = {
                op: obj.op as SheetOp['op'],
                sheet: obj.sheet,
                col: obj.col,
                col_a: obj.col_a,
                col_b: obj.col_b,
                from_col: obj.from_col,
                to_col: obj.to_col,
                value: obj.value,
                match: obj.match,
                order: obj.order,
                new_name: obj.new_name,
              }
              pendingOps.push(operation)
              send({ type: 'op', op: operation })

            } else if (obj.type === 'sheet' && obj.name && Array.isArray(obj.data)) {
              const sheet: SheetData = { name: obj.name, data: obj.data as CellValue[][] }
              const sheetValue: SheetData = {
                name: obj.name,
                data: Array.isArray(obj.valueData)
                  ? (obj.valueData as CellValue[][])
                  : (obj.data as CellValue[][]),
              }
              resultSheets.push(sheet)
              resultSheetsValueOnly.push(sheetValue)
              send({ type: 'sheet', sheet, sheetValue })

            } else if (obj.type === 'done') {
              summary = obj.summary ?? ''
            }
          } catch {
            // 파싱 실패 줄 무시
          }
        }

        // 모델 순서대로 시도
        let streamSuccess = false
        for (const m of modelsToTry) {
          send({ type: 'progress', message: `${m} 연결 중...` })

          resultSheets.length = 0
          resultSheetsValueOnly.length = 0
          pendingOps.length = 0
          collectedMessages.length = 0
          logs.length = 0
          summary = ''
          fullText = ''
          let lineBuffer = ''

          try {
            const messageStream = anthropic.messages.stream({
              model: m,
              max_tokens: 16000,
              system: SYSTEM_PROMPT,
              messages: [{ role: 'user', content: userMsg }],
            })

            for await (const chunk of messageStream) {
              if (
                chunk.type === 'content_block_delta' &&
                chunk.delta.type === 'text_delta'
              ) {
                const text = chunk.delta.text
                fullText += text
                lineBuffer += text

                const lines = lineBuffer.split('\n')
                lineBuffer = lines.pop() ?? ''
                for (const line of lines) {
                  processLine(line)
                }
              }
            }

            if (lineBuffer.trim()) processLine(lineBuffer)

            usedModel = m
            streamSuccess = true
            break
          } catch (e) {
            const err = e as { status?: number }
            if (err.status === 404 || err.status === 400) {
              send({ type: 'progress', message: `${m} 사용 불가, 다음 모델 시도...` })
              continue
            }
            throw e
          }
        }

        if (!streamSuccess) {
          send({ type: 'error', error: '사용 가능한 Claude 모델이 없습니다.' })
          controller.close()
          return
        }

        // 방식 A: 연산 명세만 있는 경우
        if (pendingOps.length > 0 && resultSheets.length === 0 && collectedMessages.length === 0) {
          send({
            type: 'result',
            data: {
              resultSheets: [],
              resultSheetsValueOnly: [],
              logs,
              summary,
              operations: pendingOps,
            },
          })
          controller.close()
          return
        }

        // 방식 B: 새 시트 데이터가 있는 경우
        if (resultSheets.length > 0) {
          send({
            type: 'result',
            data: { resultSheets, resultSheetsValueOnly, logs, summary },
          })
          controller.close()
          return
        }

        // 방식 C: 대화 응답만 있는 경우
        if (collectedMessages.length > 0) {
          send({
            type: 'result',
            data: {
              resultSheets: [],
              resultSheetsValueOnly: [],
              logs,
              summary: collectedMessages.join('\n\n'),
              operations: [],
              isChatOnly: true,
            },
          })
          controller.close()
          return
        }

        // 방식 A+C 혼합: 연산 + 메시지
        if (pendingOps.length > 0 && collectedMessages.length > 0) {
          send({
            type: 'result',
            data: {
              resultSheets: [],
              resultSheetsValueOnly: [],
              logs,
              summary: collectedMessages.join('\n\n') || summary,
              operations: pendingOps,
            },
          })
          controller.close()
          return
        }

        // 연산도 시트도 메시지도 없는 경우 → fullText를 summary로 사용
        if (fullText.trim()) {
          // 텍스트 응답이 있으면 대화 응답으로 처리
          const cleanText = fullText
            .replace(/```(?:json)?\n?/g, '')
            .replace(/```/g, '')
            .trim()

          send({
            type: 'result',
            data: {
              resultSheets: [],
              resultSheetsValueOnly: [],
              logs,
              summary: summary || cleanText.slice(0, 500),
              operations: [],
              isChatOnly: true,
            },
          })
          controller.close()
          return
        }

        send({
          type: 'error',
          error: `Claude(${usedModel})가 올바른 형식으로 응답하지 않았습니다. 다시 시도해 주세요.`,
        })
      } catch (err: unknown) {
        const error = err as Error & { status?: number; code?: string }
        console.error('[Claude API Error]', error)

        let msg = '처리 중 오류가 발생했습니다.'
        if (error.message?.includes('API key') || error.status === 401) {
          msg = 'API 키가 올바르지 않습니다. 환경변수를 확인하세요.'
        } else if (error.message?.includes('Connection') || error.code === 'ECONNREFUSED') {
          msg = '네트워크 연결 오류. 잠시 후 다시 시도해 주세요.'
        } else if (error.status === 429) {
          msg = 'API 요청 한도 초과. 잠시 후 다시 시도해 주세요.'
        } else if (error.message) {
          msg = error.message
        }

        send({ type: 'error', error: msg })
      } finally {
        controller.close()
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  })
}

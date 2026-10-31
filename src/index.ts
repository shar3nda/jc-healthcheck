/**
 * Welcome to Cloudflare Workers! This is your first worker.
 *
 * - Run `npm run dev` in your terminal to start a development server
 * - Open a browser tab at http://localhost:8787/ to see your worker in action
 * - Run `npm run deploy` to publish your worker
 *
 * Bind resources to your worker in `wrangler.jsonc`. After adding bindings, a type definition for the
 * `Env` object can be regenerated with `npm run cf-typegen`.
 *
 * Learn more at https://developers.cloudflare.com/workers/
 */

const SERVER_URL = 'https://health.jujacloud.tech/ping'
const PING_TIMEOUT_MS = 10000

type PingResponse = {
    message: string
    timestamp: string
}

export default {
    async fetch(request, env, ctx): Promise<Response> {
        let response: Response
        try {
            response = await fetch(SERVER_URL, {
                signal: AbortSignal.timeout(PING_TIMEOUT_MS),
            })
        } catch (error) {
            if (error instanceof Error) {
                console.error('Failed to fetch:', error)
            } else {
                console.error('Failed to fetch:', error)
            }
            return new Response('Server is unhealthy', { status: 500 })
        }
        if (!response.ok) {
            try {
                console.error('Response not ok:', await response.text())
            } catch (error) {
                console.error('Failed to read response text:', error)
            }
            return new Response(`Server is unhealthy`, { status: 500 })
        }
        let data: PingResponse
        try {
            data = await response.json()
        } catch (error) {
            console.error('Failed to parse JSON:', error)
            return new Response('Server is unhealthy', { status: 500 })
        }
        if (data.message === 'pong') {
            return new Response('Server is healthy', { status: 200 })
        } else {
            console.error('Unexpected response data:', data)
            return new Response('Server is unhealthy', { status: 500 })
        }
    },
} satisfies ExportedHandler<Env>

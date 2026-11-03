const SERVER_URL = 'https://health.jujacloud.tech/ping'
const PING_TIMEOUT_MS = 20000

interface Env {
    ALERT_EMAIL: SendEmail
    HEALTH_STATE: KVNamespace
    DESTINATION_EMAIL: string
}

const HEALTH_STATE_KEY = 'status'

type HealthResult = { healthy: true } | { healthy: false; error: string }

const errorMessage = (error: unknown): string =>
    error instanceof Error ? error.message : String(error)

const checkWithRetry = async (): Promise<HealthResult> => {
    const first = await checkHealth()
    if (first.healthy) return first
    await scheduler.wait(10000)
    return checkHealth()
}

const checkHealth = async (): Promise<HealthResult> => {
    let response: Response
    try {
        response = await fetch(SERVER_URL, {
            signal: AbortSignal.timeout(PING_TIMEOUT_MS),
        })
    } catch (error) {
        return {
            healthy: false,
            error: `Request failed: ${errorMessage(error)}`,
        }
    }

    if (!response.ok) {
        let details: string
        try {
            details = (await response.text()).slice(0, 2000)
        } catch (error) {
            details = `Could not read response body: ${errorMessage(error)}`
        }

        return {
            healthy: false,
            error: `HTTP ${response.status} ${response.statusText}\n${details}`,
        }
    }

    let data: unknown
    try {
        data = await response.json()
    } catch (error) {
        return {
            healthy: false,
            error: `Failed to parse JSON: ${errorMessage(error)}`,
        }
    }

    if (
        typeof data !== 'object' ||
        data === null ||
        !('message' in data) ||
        data.message !== 'pong'
    ) {
        return {
            healthy: false,
            error: `Unexpected response: ${JSON.stringify(data)?.slice(0, 2000)}`,
        }
    }

    return { healthy: true }
}

export default {
    async scheduled(controller: ScheduledController, env: Env, ctx: ExecutionContext) {
        const result = await checkWithRetry()
        const healthy = result.healthy
        const status = healthy ? 'healthy' : 'unhealthy'
        const previousStatus = await env.HEALTH_STATE.get(HEALTH_STATE_KEY)

        console.log(
            JSON.stringify({
                status,
                previousStatus,
                error: result.healthy ? undefined : result.error,
            }),
        )

        if (previousStatus === status) {
            return
        }

        if (previousStatus === null && healthy) {
            await env.HEALTH_STATE.put(HEALTH_STATE_KEY, status)
            return
        }

        await env.ALERT_EMAIL.send({
            from: 'alerts@jujacloud.tech',
            to: env.DESTINATION_EMAIL,
            subject: healthy ? 'Service recovered' : 'Health check failed',
            text: [
                `${SERVER_URL} is ${healthy ? 'healthy' : 'unhealthy'}.`,
                `Checked at: ${new Date().toISOString()}`,
                ...(!result.healthy ? ['', 'Error details:', result.error] : []),
            ].join('\n'),
        })

        await env.HEALTH_STATE.put(HEALTH_STATE_KEY, status)
    },
} satisfies ExportedHandler<Env>

import { createAgentApp } from "@lucid-agents/agent-kit";
import { z } from "zod";

// Input schema for dark pool submission
const DarkPoolSubmitInputSchema = z.object({
  agent_id: z.string().min(1).describe("Unique identifier for your agent"),
  target_endpoint: z
    .string()
    .url()
    .describe("The x402 endpoint URL to call privately"),
  request_payload: z
    .record(z.any())
    .describe("The request data to send to the endpoint"),
  payment_amount: z
    .string()
    .regex(/^\d+\.\d{2}$/)
    .describe('Payment amount in USDC (e.g., "10.00")'),
});

// Output schema
const DarkPoolSubmitOutputSchema = z.object({
  success: z.boolean(),
  transaction_id: z.string().optional(),
  message: z.string(),
  estimated_execution: z.string().optional(),
});

const { app, addEntrypoint, config } = createAgentApp(
  {
    name: "Agent Dark Pool - Private MEV Protection",
    version: "1.0.0",
    description:
      "Submit transactions to a private mempool with MEV protection. Pay a 5% privacy premium for atomic batch execution that prevents front-running and sandwich attacks. Transactions are batched every 30 seconds for maximum privacy.",
    author: "DegenLlama.net",
    organization: "Daydreams",
    provider: "Daydreams",
    framework: "x402 / agent-kit",
  } as any,
  {
    config: {
      payments: {
        facilitatorUrl: "https://facilitator.daydreams.systems",
        payTo: "0x01D11F7e1a46AbFC6092d7be484895D2d505095c",
        network: "base",
        asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
        defaultPrice: "$0.50",
      },
    },
    useConfigPayments: true,
    ap2: {
      required: true,
      params: { roles: ["merchant"] },
    },
  }
);

// Register the submit entrypoint
addEntrypoint({
  key: "submit",
  description:
    "Submit a private transaction to the dark pool. Your transaction will be queued and executed atomically in a batch with other transactions, preventing MEV attacks. Includes a 5% privacy premium on top of your transaction value.",
  input: DarkPoolSubmitInputSchema,
  output: DarkPoolSubmitOutputSchema,
  price: "$0.50",
  async handler({ input }) {
    const backendUrl = process.env.CLOUDFLARE_BACKEND || "https://agent-dark-pool.pulseradar.workers.dev";
    const apiKey = process.env.INTERNAL_API_KEY;

    if (!apiKey) {
      return {
        output: {
          success: false,
          message: "Service misconfigured: Missing API key",
        },
        usage: {
          total_tokens: 10,
        },
      };
    }

    try {
      // Forward the request to the Cloudflare backend with authentication
      const response = await fetch(`${backendUrl}/submit`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-API-Key": apiKey,
        },
        body: JSON.stringify({
          agent_id: input.agent_id,
          target_endpoint: input.target_endpoint,
          request_payload: input.request_payload,
          payment_amount: input.payment_amount,
        }),
      });

      const data = await response.json() as any;

      if (!response.ok) {
        return {
          output: {
            success: false,
            message: data.error || `Backend error: ${response.status}`,
          },
          usage: {
            total_tokens: 10,
          },
        };
      }

      return {
        output: {
          success: data.success,
          transaction_id: data.transaction_id,
          message: data.message || "Transaction submitted to dark pool",
          estimated_execution: data.estimated_execution,
        },
        usage: {
          total_tokens: 50,
        },
      };
    } catch (error: any) {
      console.error("Error forwarding to backend:", error);
      return {
        output: {
          success: false,
          message: `Failed to submit transaction: ${error.message}`,
        },
        usage: {
          total_tokens: 10,
        },
      };
    }
  },
});

const PORT = parseInt(process.env.PORT || "8080");
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

console.log(`
╔═══════════════════════════════════════════════════════════════╗
║          🔒 AGENT DARK POOL - PAYMENT PROXY 🔒              ║
╠═══════════════════════════════════════════════════════════════╣
║  Private MEV Protection for x402 Agents                      ║
║  Powered by x402 Protocol                                     ║
╠═══════════════════════════════════════════════════════════════╣
║  🚀 Server running on port ${PORT}
║  📝 Manifest: ${BASE_URL}/.well-known/agent.json
║  💰 Payment address: ${config.payments?.payTo}
║  💵 Price: 0.50 USDC per submission
║  🌐 Network: Base
║  🔐 Backend: ${process.env.CLOUDFLARE_BACKEND || "https://agent-dark-pool.pulseradar.workers.dev"}
╠═══════════════════════════════════════════════════════════════╣
║  📊 Privacy Premium: 5% of transaction value                 ║
║  ⏱️  Batch Window: 30 seconds                                ║
║  🛡️  MEV Protection: Front-running & sandwich attack proof   ║
╚═══════════════════════════════════════════════════════════════╝
`);

// Export agent-kit app for Bun/Railway
export default {
  port: PORT,
  fetch: app.fetch,
};

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createHash } from "crypto";
import { z } from "zod";
import {
  DocumentAcceptanceRequiredError,
  Gate2DetailsRequiredError,
  KycVerificationRequiredError,
  createDepositPaymentSession,
} from "@/lib/db/repository";
import { getDbClient } from "@/lib/db/client";
import { SESSION_COOKIE_NAME } from "@/lib/rebohrome-data";
import { getMaintenanceApiResponse } from "@/lib/server/maintenance-guard";
import { withPerf } from "@/lib/server/perf";

const depositMethods = ["Credit Card", "Apple Pay", "Google Pay"] as const;
const supportedCurrencies = ["USD", "EUR"] as const;

const sessionSchema = z.object({
  amount: z.number().positive(),
  currency: z.enum(supportedCurrencies),
  paymentMethod: z.enum(depositMethods),
  provider: z.enum(["TransVoucher", "Cleffo", "Wert.io", "Coinflow"]).optional(),
  gateNumber: z.number().int().positive().optional(),
});

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const sessionUserCache = new Map<string, { userId: string; cachedUntil: number }>();

async function getDepositSessionUserId() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value ?? null;

  if (!token) {
    return null;
  }

  const tokenHash = createHash("sha256").update(token).digest("hex");
  const cachedSession = sessionUserCache.get(tokenHash);
  if (cachedSession && cachedSession.cachedUntil > Date.now()) {
    return cachedSession.userId;
  }

  let lastError: unknown = null;

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const result = await getDbClient().execute({
        sql: `select sessions.user_id
          from sessions
          inner join users on users.id = sessions.user_id
          where sessions.token_hash = ?
            and sessions.expires_at > ?
            and coalesce(users.is_deleted, 0) = 0
            and users.status = 'active'
          limit 1`,
        args: [tokenHash, new Date().toISOString()],
      });

      const row = result.rows[0];
      const userId = row?.user_id ? String(row.user_id) : null;
      if (userId) {
        sessionUserCache.set(tokenHash, {
          userId,
          cachedUntil: Date.now() + 60_000,
        });
      }
      return userId;
    } catch (error) {
      lastError = error;
      if (attempt < 3) {
        await sleep(150 * attempt);
      }
    }
  }

  throw lastError;
}

export async function POST(request: Request) {
  return withPerf("route=/api/deposit/session", async () => {
  try {
    const maintenanceResponse = await getMaintenanceApiResponse();
    if (maintenanceResponse) {
      return maintenanceResponse;
    }

    const payload = sessionSchema.parse(await request.json());
    const sessionInput = {
      amount: payload.amount,
      currency: payload.currency,
      paymentMethod: payload.paymentMethod,
    };
    const userId = await getDepositSessionUserId();

    if (!userId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const result = await createDepositPaymentSession({
      userId,
      provider: payload.provider,
      gateNumber: payload.gateNumber,
      ...sessionInput,
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof DocumentAcceptanceRequiredError) {
      return NextResponse.json(
        {
          ok: false,
          code: "DOCUMENT_ACCEPTANCE_REQUIRED",
          message: "Required documents must be accepted before continuing.",
          error: "Please accept the required ReboHrome documents before continuing.",
        },
        { status: 403 },
      );
    }

    if (error instanceof KycVerificationRequiredError) {
      return NextResponse.json(
        {
          error: "Please complete verification before making a card payment.",
          requiresVerification: true,
        },
        { status: 403 },
      );
    }

    if (
      error instanceof Error &&
      error.message === "This payment gate is not available for your account."
    ) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 },
      );
    }

    if (error instanceof Gate2DetailsRequiredError) {
      return NextResponse.json(
        {
          error: error.message,
          requiresGate2Details: true,
        },
        { status: 400 },
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to initialize secure deposit.",
      },
      { status: 400 },
    );
  }
  });
}

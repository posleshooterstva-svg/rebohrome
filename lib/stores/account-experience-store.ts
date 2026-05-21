"use client";

import { create } from "zustand";
import {
  formatCurrency,
  formatUsd,
  type OrderRecord,
  type ProductRecord,
  type SupportedCurrency,
} from "@/lib/rebohrome-data";

export type LiveActivityItem = {
  id: string;
  title: string;
  meta: string;
  amount: string;
  tone?: "positive" | "negative" | "neutral";
};

export type LiveInventoryItem = {
  inventoryId: string;
  orderId: string;
  quantity: number;
  acquiredAt: string;
  product: ProductRecord;
};

export type LiveOrderItem = OrderRecord;

type AccountSnapshot = {
  available: number;
  pendingWithdrawal: number;
  totalDeposited: number;
  totalSpent: number;
  totalWithdrawn: number;
};

type LiveAccountEntry = {
  balance: AccountSnapshot;
  activity: LiveActivityItem[];
  inventory: LiveInventoryItem[];
  orders: LiveOrderItem[];
  seenEvents: Record<string, true>;
};

type DepositEventInput = {
  depositId: string;
  originalAmount: number;
  originalCurrency: SupportedCurrency;
  creditedAmountUsd: number;
  summary: string;
};

type PurchaseEventInput = {
  orderId: string;
  amount: number;
  currency: SupportedCurrency;
  summary: string;
  createdAt?: string;
  items?: Array<{
    product: ProductRecord;
    quantity: number;
  }>;
};

type WithdrawalEventInput = {
  requestId: string;
  amount: number;
  summary: string;
};

type AccountExperienceState = {
  accounts: Record<string, LiveAccountEntry>;
  primeAccount: (
    userId: string,
    balance: AccountSnapshot,
    activity: LiveActivityItem[],
  ) => void;
  primeInventory: (userId: string, inventory: LiveInventoryItem[]) => void;
  primeOrders: (userId: string, orders: LiveOrderItem[]) => void;
  applyDeposit: (userId: string, input: DepositEventInput) => void;
  applyPurchase: (userId: string, input: PurchaseEventInput) => void;
  applyWithdrawalRequest: (userId: string, input: WithdrawalEventInput) => void;
};

function ensureAccountEntry(
  accounts: Record<string, LiveAccountEntry>,
  userId: string,
): LiveAccountEntry {
  return (
    accounts[userId] ?? {
      balance: {
        available: 0,
        pendingWithdrawal: 0,
        totalDeposited: 0,
        totalSpent: 0,
        totalWithdrawn: 0,
      },
      activity: [],
      inventory: [],
      orders: [],
      seenEvents: {},
    }
  );
}

function prependActivity(
  current: LiveActivityItem[],
  nextItem: LiveActivityItem,
): LiveActivityItem[] {
  return [nextItem, ...current.filter((item) => item.id !== nextItem.id)].slice(0, 6);
}

function mergeInventory(
  current: LiveInventoryItem[],
  incoming: LiveInventoryItem[],
): LiveInventoryItem[] {
  const byKey = new Map<string, LiveInventoryItem>();

  for (const entry of current) {
    byKey.set(`${entry.orderId}:${entry.product.id}`, entry);
  }

  for (const entry of incoming) {
    byKey.set(`${entry.orderId}:${entry.product.id}`, entry);
  }

  return Array.from(byKey.values()).sort((left, right) =>
    right.acquiredAt.localeCompare(left.acquiredAt),
  );
}

function mergeOrders(current: LiveOrderItem[], incoming: LiveOrderItem[]): LiveOrderItem[] {
  const byId = new Map<string, LiveOrderItem>();

  for (const entry of current) {
    byId.set(entry.id, entry);
  }

  for (const entry of incoming) {
    byId.set(entry.id, {
      ...(byId.get(entry.id) ?? entry),
      ...entry,
    });
  }

  return Array.from(byId.values()).sort((left, right) =>
    right.createdAt.localeCompare(left.createdAt),
  );
}

export const useAccountExperienceStore = create<AccountExperienceState>((set) => ({
  accounts: {},
  primeAccount: (userId, balance, activity) =>
    set((state) => {
      const current = state.accounts[userId];

      if (current) {
        return {
          accounts: {
            ...state.accounts,
            [userId]: {
              ...current,
              balance:
                current.balance.available === 0 &&
                current.balance.pendingWithdrawal === 0 &&
                current.balance.totalDeposited === 0 &&
                current.balance.totalSpent === 0 &&
                current.balance.totalWithdrawn === 0
                  ? balance
                  : current.balance,
              activity:
                current.activity.length === 0 && activity.length > 0
                  ? activity
                  : current.activity,
            },
          },
        };
      }

      return {
        accounts: {
          ...state.accounts,
          [userId]: {
            balance,
            activity,
            inventory: [],
            orders: [],
            seenEvents: {},
          },
        },
      };
    }),
  primeInventory: (userId, inventory) =>
    set((state) => {
      const current = ensureAccountEntry(state.accounts, userId);

      return {
        accounts: {
          ...state.accounts,
          [userId]: {
            ...current,
            inventory:
              current.inventory.length === 0
                ? inventory
                : mergeInventory(current.inventory, inventory),
          },
        },
      };
    }),
  primeOrders: (userId, orders) =>
    set((state) => {
      const current = ensureAccountEntry(state.accounts, userId);

      return {
        accounts: {
          ...state.accounts,
          [userId]: {
            ...current,
            orders: current.orders.length === 0 ? orders : mergeOrders(current.orders, orders),
          },
        },
      };
    }),
  applyDeposit: (userId, input) =>
    set((state) => {
      const current = ensureAccountEntry(state.accounts, userId);
      const eventKey = `deposit:${input.depositId}`;

      if (current.seenEvents[eventKey]) {
        return state;
      }

      return {
        accounts: {
          ...state.accounts,
          [userId]: {
            ...current,
            balance: {
              ...current.balance,
              available: current.balance.available + input.creditedAmountUsd,
              totalDeposited:
                current.balance.totalDeposited + input.creditedAmountUsd,
            },
            activity: prependActivity(current.activity, {
              id: eventKey,
              title: "Deposit",
              meta: input.summary,
              amount: `+${formatCurrency(
                input.originalAmount,
                input.originalCurrency,
              )}`,
              tone: "positive",
            }),
            seenEvents: {
              ...current.seenEvents,
              [eventKey]: true,
            },
          },
        },
      };
    }),
  applyPurchase: (userId, input) =>
    set((state) => {
      const current = ensureAccountEntry(state.accounts, userId);
      const eventKey = `purchase:${input.orderId}`;

      if (current.seenEvents[eventKey]) {
        return state;
      }

      return {
        accounts: {
          ...state.accounts,
          [userId]: {
            ...current,
            balance: {
              ...current.balance,
              available: current.balance.available - input.amount,
              totalSpent: current.balance.totalSpent + input.amount,
            },
            inventory: input.items
              ? mergeInventory(
                  current.inventory,
                  input.items.map((item, index) => ({
                    inventoryId: `optimistic-${input.orderId}-${item.product.id}-${index}`,
                    orderId: input.orderId,
                    quantity: item.quantity,
                    acquiredAt: input.createdAt ?? new Date().toISOString(),
                    product: item.product,
                  })),
                )
              : current.inventory,
            orders: mergeOrders(current.orders, [
              {
                id: input.orderId,
                userId,
                status: "Completed",
                paymentState: "completed",
                subtotal: input.amount,
                shipping: 0,
                total: input.amount,
                currency: input.currency,
                paymentProvider: null,
                transvoucherTransactionId: null,
                transvoucherReferenceId: null,
                providerStatus: null,
                shippingName: "",
                shippingEmail: "",
                shippingAddress: "",
                shippingCity: "",
                shippingPostalCode: "",
                paymentMethod: "Archive Balance",
                failureReason: null,
                remainingBalance: Math.max(
                  current.balance.available - input.amount,
                  0,
                ),
                createdAt: input.createdAt ?? new Date().toISOString(),
                updatedAt: input.createdAt ?? new Date().toISOString(),
                paidAt: input.createdAt ?? new Date().toISOString(),
                itemCount:
                  input.items?.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
              },
            ]),
            activity: prependActivity(current.activity, {
              id: eventKey,
              title: "Purchase",
              meta: input.summary,
              amount: `-${formatCurrency(input.amount, input.currency)}`,
              tone: "negative",
            }),
            seenEvents: {
              ...current.seenEvents,
              [eventKey]: true,
            },
          },
        },
      };
    }),
  applyWithdrawalRequest: (userId, input) =>
    set((state) => {
      const current = ensureAccountEntry(state.accounts, userId);
      const eventKey = `withdrawal:${input.requestId}`;

      if (current.seenEvents[eventKey]) {
        return state;
      }

      return {
        accounts: {
          ...state.accounts,
          [userId]: {
            ...current,
            balance: {
              ...current.balance,
              available: current.balance.available - input.amount,
              pendingWithdrawal:
                current.balance.pendingWithdrawal + input.amount,
            },
            activity: prependActivity(current.activity, {
              id: eventKey,
              title: "Withdrawal Request",
              meta: input.summary,
              amount: `-${formatUsd(input.amount)}`,
              tone: "negative",
            }),
            seenEvents: {
              ...current.seenEvents,
              [eventKey]: true,
            },
          },
        },
      };
    }),
}));

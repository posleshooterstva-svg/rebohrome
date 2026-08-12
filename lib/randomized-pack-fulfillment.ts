import { randomUUID } from "node:crypto";
import type { InStatement, Transaction } from "@libsql/client";

type SqlRow = Record<string, unknown>;

async function one(transaction: Transaction, statement: InStatement) {
  const result = await transaction.execute(statement);
  return (result.rows[0] as SqlRow | undefined) ?? null;
}

export type RandomizedPackFulfillmentResult = {
  created: boolean;
  drawId: string;
  productId: string;
  title: string;
};

export async function releaseRandomizedPackReservations(
  transaction: Transaction,
  input: { orderId: string; reason: string; releasedAt: string },
) {
  const result = await transaction.execute({
    sql: `update randomized_pack_reservations set status = 'released', released_at = ?,
      updated_at = ?, release_reason = ? where order_id = ? and status = 'active'`,
    args: [input.releasedAt, input.releasedAt, input.reason, input.orderId],
  });
  return result.rowsAffected;
}

export async function expireRandomizedPackReservations(
  transaction: Transaction,
  input: { expiredAt: string },
) {
  const result = await transaction.execute({
    sql: `update randomized_pack_reservations set status = 'expired', released_at = ?,
      updated_at = ?, release_reason = 'payment_session_expired'
      where status = 'active' and expires_at <= ?`,
    args: [input.expiredAt, input.expiredAt, input.expiredAt],
  });
  return result.rowsAffected;
}

export async function consumeRandomizedPackReservation(
  transaction: Transaction,
  input: {
    orderId: string;
    orderItemId: string;
    userId: string;
    acquiredAt: string;
  },
): Promise<RandomizedPackFulfillmentResult> {
  const existingDraw = await one(transaction, {
    sql: `select randomized_pack_draws.id, randomized_pack_draws.outcome_product_id,
      products.title from randomized_pack_draws
      inner join products on products.id = randomized_pack_draws.outcome_product_id
      where randomized_pack_draws.order_item_id = ? limit 1`,
    args: [input.orderItemId],
  });
  if (existingDraw) {
    return {
      created: false,
      drawId: String(existingDraw.id),
      productId: String(existingDraw.outcome_product_id),
      title: String(existingDraw.title),
    };
  }

  const reservation = await one(transaction, {
    sql: `select randomized_pack_reservations.*, randomized_pack_outcomes.probability_bps,
      randomized_pack_outcomes.price_snapshot, products.title
      from randomized_pack_reservations
      inner join randomized_pack_outcomes
        on randomized_pack_outcomes.version_id = randomized_pack_reservations.version_id
       and randomized_pack_outcomes.outcome_product_id = randomized_pack_reservations.outcome_product_id
      inner join products on products.id = randomized_pack_reservations.outcome_product_id
      where randomized_pack_reservations.order_item_id = ?
        and randomized_pack_reservations.status = 'active'
      limit 1`,
    args: [input.orderItemId],
  });
  if (!reservation) {
    throw new Error("Paid randomized pack has no active reserved card.");
  }

  const stockResult = await transaction.execute({
    sql: "update products set stock = stock - 1, updated_at = ? where id = ? and stock > 0",
    args: [input.acquiredAt, String(reservation.outcome_product_id)],
  });
  if (stockResult.rowsAffected !== 1) {
    throw new Error("The reserved randomized card is no longer available.");
  }

  const drawId = randomUUID();
  await transaction.execute({
    sql: `insert into owned_cards (
      id, user_id, product_id, order_id, quantity, acquired_at
    ) values (?, ?, ?, ?, 1, ?)`,
    args: [
      randomUUID(),
      input.userId,
      String(reservation.outcome_product_id),
      input.orderId,
      input.acquiredAt,
    ],
  });
  await transaction.execute({
    sql: `insert into randomized_pack_draws (
      id, order_id, order_item_id, user_id, pack_product_id, version_id,
      outcome_product_id, reservation_id, roll, probability_bps,
      price_snapshot, created_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      drawId,
      input.orderId,
      input.orderItemId,
      input.userId,
      String(reservation.pack_product_id),
      String(reservation.version_id),
      String(reservation.outcome_product_id),
      String(reservation.id),
      Number(reservation.roll),
      Number(reservation.probability_bps),
      Number(reservation.price_snapshot),
      input.acquiredAt,
    ],
  });
  const reservationResult = await transaction.execute({
    sql: `update randomized_pack_reservations set status = 'consumed',
      consumed_at = ?, updated_at = ? where id = ? and status = 'active'`,
    args: [input.acquiredAt, input.acquiredAt, String(reservation.id)],
  });
  if (reservationResult.rowsAffected !== 1) {
    throw new Error("Randomized card reservation was already consumed.");
  }
  await transaction.execute({
    sql: `update order_items set drawn_product_id = ?, randomized_draw_id = ?
      where id = ? and randomized_draw_id is null`,
    args: [String(reservation.outcome_product_id), drawId, input.orderItemId],
  });

  return {
    created: true,
    drawId,
    productId: String(reservation.outcome_product_id),
    title: String(reservation.title),
  };
}

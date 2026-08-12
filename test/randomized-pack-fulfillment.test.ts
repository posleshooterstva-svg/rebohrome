import assert from "node:assert/strict";
import test from "node:test";
import { rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import {
  consumeRandomizedPackReservation,
  expireRandomizedPackReservations,
  releaseRandomizedPackReservations,
} from "../lib/randomized-pack-fulfillment.ts";
import { RANDOMIZED_PACK_CREATE_STATEMENTS } from "../lib/randomized-pack-schema.ts";

async function createFixture() {
  const databasePath = path.join(tmpdir(), `rebohrome-randomized-${randomUUID()}.db`);
  const client = createClient({ url: `file:${databasePath.replace(/\\/g, "/")}` });
  await client.execute(`create table products (
    id text primary key, title text not null, stock integer not null, updated_at text not null
  )`);
  await client.execute(`create table order_items (
    id text primary key, drawn_product_id text, randomized_draw_id text
  )`);
  await client.execute(`create table owned_cards (
    id text primary key, user_id text not null, product_id text not null,
    order_id text not null, quantity integer not null, acquired_at text not null
  )`);
  for (const statement of RANDOMIZED_PACK_CREATE_STATEMENTS) {
    await client.execute(statement);
  }
  await client.execute({
    sql: "insert into products (id, title, stock, updated_at) values (?, ?, 1, ?)",
    args: ["card-1", "Card One", "2026-08-10T00:00:00.000Z"],
  });
  await client.execute({
    sql: "insert into products (id, title, stock, updated_at) values (?, ?, 1, ?)",
    args: ["card-2", "Card Two", "2026-08-10T00:00:00.000Z"],
  });
  await client.execute({
    sql: `insert into randomized_pack_versions (
      id, pack_product_id, version, status, seed, formula_version,
      total_probability_bps, expected_value, big_win_probability_bps,
      created_at, published_at
    ) values ('version-1', 'pack-1', 1, 'draft', 'seed', 'inverse-price-v1',
      10000, 75, 5000, '2026-08-10T00:00:00.000Z', null)`,
  });
  await client.execute({
    sql: `insert into randomized_pack_outcomes (
      id, version_id, outcome_product_id, probability_bps,
      price_snapshot, title_snapshot, ordinal
    ) values ('outcome-1', 'version-1', 'card-1', 5000, 50, 'Card One', 0)`,
  });
  await client.execute({
    sql: `insert into randomized_pack_outcomes (
      id, version_id, outcome_product_id, probability_bps,
      price_snapshot, title_snapshot, ordinal
    ) values ('outcome-2', 'version-1', 'card-2', 5000, 100, 'Card Two', 1)`,
  });
  await client.execute(
    "update randomized_pack_versions set status = 'published', published_at = '2026-08-10T00:00:00.000Z' where id = 'version-1'",
  );
  return { client, databasePath };
}

async function addReservation(
  client: ReturnType<typeof createClient>,
  input: { orderId: string; orderItemId: string; reservationId: string },
) {
  await client.execute({
    sql: "insert into order_items (id) values (?)",
    args: [input.orderItemId],
  });
  await client.execute({
    sql: `insert into randomized_pack_reservations (
      id, order_id, order_item_id, user_id, pack_product_id, version_id,
      outcome_product_id, roll, status, expires_at, created_at, updated_at
    ) values (?, ?, ?, 'user-1', 'pack-1', 'version-1', 'card-1', 42,
      'active', '2026-08-11T00:00:00.000Z', '2026-08-10T00:00:00.000Z',
      '2026-08-10T00:00:00.000Z')`,
    args: [input.reservationId, input.orderId, input.orderItemId],
  });
}

async function closeFixture(client: ReturnType<typeof createClient>, databasePath: string) {
  client.close();
  for (let attempt = 0; attempt < 10; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 25));
    try {
      await Promise.all([
        rm(databasePath, { force: true }),
        rm(`${databasePath}-shm`, { force: true }),
        rm(`${databasePath}-wal`, { force: true }),
      ]);
      return;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EBUSY") throw error;
      // The native Windows SQLite handle can outlive client.close() briefly.
      // The uniquely named test database remains in the OS temp directory only.
      if (attempt === 9) return;
    }
  }
}

test("consumes a reserved card exactly once across repeated payment handling", async () => {
  const { client, databasePath } = await createFixture();
  try {
    await addReservation(client, {
      orderId: "order-1",
      orderItemId: "item-1",
      reservationId: "reservation-1",
    });
    const firstTransaction = await client.transaction("write");
    const first = await consumeRandomizedPackReservation(firstTransaction, {
      orderId: "order-1",
      orderItemId: "item-1",
      userId: "user-1",
      acquiredAt: "2026-08-10T00:01:00.000Z",
    });
    await firstTransaction.commit();
    assert.equal(first.created, true);

    const duplicateTransaction = await client.transaction("write");
    const duplicate = await consumeRandomizedPackReservation(duplicateTransaction, {
      orderId: "order-1",
      orderItemId: "item-1",
      userId: "user-1",
      acquiredAt: "2026-08-10T00:02:00.000Z",
    });
    await duplicateTransaction.commit();
    assert.equal(duplicate.created, false);
    assert.equal(duplicate.drawId, first.drawId);

    const stock = await client.execute("select stock from products where id = 'card-1'");
    const draws = await client.execute("select count(*) as count from randomized_pack_draws");
    const owned = await client.execute("select count(*) as count from owned_cards");
    assert.equal(Number(stock.rows[0]?.stock), 0);
    assert.equal(Number(draws.rows[0]?.count), 1);
    assert.equal(Number(owned.rows[0]?.count), 1);
  } finally {
    await closeFixture(client, databasePath);
  }
});

test("rolls back instead of double-selling a unit reserved by another order", async () => {
  const { client, databasePath } = await createFixture();
  try {
    await addReservation(client, {
      orderId: "order-1",
      orderItemId: "item-1",
      reservationId: "reservation-1",
    });
    await addReservation(client, {
      orderId: "order-2",
      orderItemId: "item-2",
      reservationId: "reservation-2",
    });

    const firstTransaction = await client.transaction("write");
    await consumeRandomizedPackReservation(firstTransaction, {
      orderId: "order-1",
      orderItemId: "item-1",
      userId: "user-1",
      acquiredAt: "2026-08-10T00:01:00.000Z",
    });
    await firstTransaction.commit();

    const secondTransaction = await client.transaction("write");
    await assert.rejects(
      consumeRandomizedPackReservation(secondTransaction, {
        orderId: "order-2",
        orderItemId: "item-2",
        userId: "user-1",
        acquiredAt: "2026-08-10T00:02:00.000Z",
      }),
      /no longer available/,
    );
    await secondTransaction.rollback();

    const draws = await client.execute("select count(*) as count from randomized_pack_draws");
    const owned = await client.execute("select count(*) as count from owned_cards");
    const secondReservation = await client.execute(
      "select status from randomized_pack_reservations where id = 'reservation-2'",
    );
    assert.equal(Number(draws.rows[0]?.count), 1);
    assert.equal(Number(owned.rows[0]?.count), 1);
    assert.equal(String(secondReservation.rows[0]?.status), "active");
  } finally {
    await closeFixture(client, databasePath);
  }
});

test("keeps published odds and completed draws immutable", async () => {
  const { client, databasePath } = await createFixture();
  try {
    await assert.rejects(
      client.execute(
        "update randomized_pack_outcomes set probability_bps = 9999 where id = 'outcome-1'",
      ),
      /immutable/,
    );

    await addReservation(client, {
      orderId: "order-1",
      orderItemId: "item-1",
      reservationId: "reservation-1",
    });
    const transaction = await client.transaction("write");
    await consumeRandomizedPackReservation(transaction, {
      orderId: "order-1",
      orderItemId: "item-1",
      userId: "user-1",
      acquiredAt: "2026-08-10T00:01:00.000Z",
    });
    await transaction.commit();

    await assert.rejects(
      client.execute("delete from randomized_pack_draws where order_item_id = 'item-1'"),
      /cannot be deleted/,
    );
    const draws = await client.execute("select count(*) as count from randomized_pack_draws");
    assert.equal(Number(draws.rows[0]?.count), 1);
  } finally {
    await closeFixture(client, databasePath);
  }
});

test("rejects publication when draft probabilities do not total 100 percent", async () => {
  const { client, databasePath } = await createFixture();
  try {
    await client.execute({
      sql: `insert into randomized_pack_versions (
        id, pack_product_id, version, status, seed, formula_version,
        total_probability_bps, expected_value, big_win_probability_bps,
        created_at, published_at
      ) values ('version-invalid', 'pack-2', 1, 'draft', 'seed-2', 'inverse-price-v1',
        10000, 50, 0, '2026-08-10T00:00:00.000Z', null)`,
      args: [],
    });
    await client.execute({
      sql: `insert into randomized_pack_outcomes (
        id, version_id, outcome_product_id, probability_bps,
        price_snapshot, title_snapshot, ordinal
      ) values ('outcome-invalid', 'version-invalid', 'card-1', 9999, 50, 'Card One', 0)`,
      args: [],
    });
    await assert.rejects(
      client.execute(
        "update randomized_pack_versions set status = 'published' where id = 'version-invalid'",
      ),
      /at least two outcomes|10000 bps/,
    );
  } finally {
    await closeFixture(client, databasePath);
  }
});

test("expires old holds and releases cancelled orders without a cron job", async () => {
  const { client, databasePath } = await createFixture();
  try {
    await addReservation(client, {
      orderId: "order-expired",
      orderItemId: "item-expired",
      reservationId: "reservation-expired",
    });
    await addReservation(client, {
      orderId: "order-cancelled",
      orderItemId: "item-cancelled",
      reservationId: "reservation-cancelled",
    });
    await client.execute(
      "update randomized_pack_reservations set expires_at = '2026-08-09T00:00:00.000Z' where id = 'reservation-expired'",
    );

    const expirationTransaction = await client.transaction("write");
    const expired = await expireRandomizedPackReservations(expirationTransaction, {
      expiredAt: "2026-08-10T00:00:00.000Z",
    });
    await expirationTransaction.commit();
    assert.equal(expired, 1);

    const cancellationTransaction = await client.transaction("write");
    const released = await releaseRandomizedPackReservations(cancellationTransaction, {
      orderId: "order-cancelled",
      reason: "payment_cancelled",
      releasedAt: "2026-08-10T00:01:00.000Z",
    });
    await cancellationTransaction.commit();
    assert.equal(released, 1);

    const states = await client.execute(
      "select id, status, release_reason from randomized_pack_reservations order by id",
    );
    assert.deepEqual(
      states.rows.map((row) => [row.id, row.status, row.release_reason]),
      [
        ["reservation-cancelled", "released", "payment_cancelled"],
        ["reservation-expired", "expired", "payment_session_expired"],
      ],
    );
  } finally {
    await closeFixture(client, databasePath);
  }
});

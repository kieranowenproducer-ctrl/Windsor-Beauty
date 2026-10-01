import type { OrderItemRecord } from '@/lib/db';

/** A saved Trial reference is the only label its order line may display. */
export function displayOrderItem(item: OrderItemRecord): OrderItemRecord {
  if (!item.fulfilmentRef) return item;
  const code = item.fulfilmentRef.trim();
  if (!/^Product [1-9]\d*$/.test(code)) {
    throw new Error('Trial order line has an invalid permanent Product code.');
  }
  return {
    ...item,
    name: code,
    variant: '',
    slug: undefined,
    batchCodes: undefined,
  };
}

export function displayOrderItems(items: OrderItemRecord[]): OrderItemRecord[] {
  return items.map(displayOrderItem);
}

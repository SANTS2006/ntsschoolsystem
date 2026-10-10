export type TransactionType = "stock_in" | "stock_out";

export interface InventoryCategory {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
}

export interface InventoryCategoryPayload {
  name: string;
  description?: string;
}

export interface InventoryCategoryListParams {
  search?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  category: string | null;
  category_name: string | null;
  sku: string;
  unit: string;
  quantity_in_stock: number;
  reorder_level: number;
  location: string;
  is_active: boolean;
  is_low_stock: boolean;
  created_at: string;
  updated_at: string;
}

/** quantity_in_stock is never client-writable — it only ever changes through the stock_in/
 * stock_out actions, which keep the InventoryTransaction ledger authoritative. */
export interface InventoryItemPayload {
  name: string;
  category?: string;
  sku?: string;
  unit?: string;
  reorder_level: number;
  location?: string;
  is_active: boolean;
}

export interface InventoryItemListParams {
  search?: string;
  category?: string;
  is_active?: boolean;
}

export interface InventoryTransaction {
  id: string;
  item: string;
  item_name: string;
  transaction_type: TransactionType;
  quantity: number;
  reason: string;
  recorded_by: string | null;
  recorded_by_name: string | null;
  created_at: string;
}

export interface InventoryTransactionListParams {
  item?: string;
  transaction_type?: TransactionType;
}

export interface StockActionPayload {
  quantity: number;
  reason?: string;
}

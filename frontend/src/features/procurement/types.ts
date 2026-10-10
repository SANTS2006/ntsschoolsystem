export type PurchaseRequestStatus = "draft" | "submitted" | "approved" | "rejected" | "cancelled";
export type PurchaseOrderStatus = "draft" | "sent" | "partially_received" | "received" | "cancelled";

export interface Supplier {
  id: string;
  name: string;
  contact_person: string;
  email: string;
  phone_number: string;
  address: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface SupplierPayload {
  name: string;
  contact_person?: string;
  email?: string;
  phone_number?: string;
  address?: string;
  is_active: boolean;
}

export interface SupplierListParams {
  search?: string;
  is_active?: boolean;
}

/** `requested_by`/`status`/`approved_by`/`approved_at`/`rejection_reason` are all server-computed —
 * the lifecycle only moves through the submit/approve/reject/cancel actions, never a plain PATCH. */
export interface PurchaseRequest {
  id: string;
  title: string;
  notes: string;
  requested_by: string | null;
  requested_by_name: string | null;
  status: PurchaseRequestStatus;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
  rejection_reason: string;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseRequestPayload {
  title: string;
  notes?: string;
}

export interface PurchaseRequestListParams {
  search?: string;
  status?: PurchaseRequestStatus;
}

export interface PurchaseRequestItem {
  id: string;
  request: string;
  inventory_item: string | null;
  inventory_item_name: string | null;
  description: string;
  quantity: number;
  estimated_unit_price: string | null;
}

export interface PurchaseRequestItemPayload {
  request: string;
  inventory_item?: string;
  description: string;
  quantity: number;
  estimated_unit_price?: string;
}

export interface PurchaseRequestItemListParams {
  request: string;
}

/** `total_amount` is server-computed, recalculated from line items on every add/edit/remove —
 * never client-writable. `created_by`/`ordered_at` are set by create/`send` respectively. */
export interface PurchaseOrder {
  id: string;
  order_number: string;
  supplier: string;
  supplier_name: string;
  source_request: string | null;
  status: PurchaseOrderStatus;
  total_amount: string;
  created_by: string | null;
  created_by_name: string | null;
  ordered_at: string | null;
  item_count: number;
  created_at: string;
  updated_at: string;
}

export interface PurchaseOrderPayload {
  order_number: string;
  supplier: string;
  source_request?: string;
}

export interface PurchaseOrderListParams {
  search?: string;
  status?: PurchaseOrderStatus;
  supplier?: string;
}

export interface PurchaseOrderItem {
  id: string;
  order: string;
  inventory_item: string | null;
  inventory_item_name: string | null;
  description: string;
  quantity_ordered: number;
  quantity_received: number;
  unit_price: string;
  is_fully_received: boolean;
}

export interface PurchaseOrderItemPayload {
  order: string;
  inventory_item?: string;
  description: string;
  quantity_ordered: number;
  unit_price: string;
}

export interface PurchaseOrderItemListParams {
  order: string;
}

export interface ReceiptLine {
  item_id: string;
  quantity: number;
}

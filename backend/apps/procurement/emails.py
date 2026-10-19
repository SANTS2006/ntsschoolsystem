"""The purchase order e-mail a supplier receives when the order is sent."""
from html import escape

from apps.common.email import send_email


def _money(value) -> str:
    return f"{value:,.2f}"


def send_order_to_supplier(order, items, *, sent_by=None) -> bool:
    """E-mails the supplier the full order. Returns False when the supplier has no address or the provider failed."""
    supplier = order.supplier
    if not supplier.email:
        return False
    school = order.school
    rows = "".join(
        f"<tr><td style=\"padding:8px;border-bottom:1px solid #e2e8f0;\">{escape(item.description)}</td>"
        f"<td style=\"padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;\">{item.quantity_ordered}</td>"
        f"<td style=\"padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;\">{_money(item.unit_price)}</td>"
        f"<td style=\"padding:8px;border-bottom:1px solid #e2e8f0;text-align:right;\">{_money(item.unit_price * item.quantity_ordered)}</td></tr>"
        for item in items
    )
    contact_bits = [bit for bit in (getattr(sent_by, "full_name", ""), getattr(sent_by, "email", ""), getattr(school, "phone_number", "")) if bit]
    body = (
        f"<p>Dear {escape(supplier.contact_person or supplier.name)},</p>"
        f"<p>{escape(school.name)} would like to place the following purchase order with you.</p>"
        f"<p><strong>Order number:</strong> {escape(order.order_number)}<br>"
        f"<strong>Date:</strong> {order.ordered_at:%d %B %Y}<br>"
        f"<strong>Supplier:</strong> {escape(supplier.name)}</p>"
        '<table style="width:100%;border-collapse:collapse;font-size:14px;">'
        '<tr style="background:#f1f5f9;"><th style="padding:8px;text-align:left;">Item</th>'
        '<th style="padding:8px;text-align:right;">Qty</th><th style="padding:8px;text-align:right;">Unit price</th>'
        '<th style="padding:8px;text-align:right;">Total</th></tr>'
        f"{rows}"
        f'<tr><td colspan="3" style="padding:8px;text-align:right;"><strong>Order total</strong></td>'
        f'<td style="padding:8px;text-align:right;"><strong>{_money(order.total_amount)}</strong></td></tr></table>'
        "<p>Please confirm receipt of this order and the expected delivery date by replying to this e-mail"
        + (f" or contacting {escape(' · '.join(contact_bits))}" if contact_bits else "")
        + ".</p>"
    )
    return send_email(
        to_email=supplier.email, to_name=supplier.contact_person or supplier.name,
        subject=f"Purchase order {order.order_number} from {school.name}", html_content=body, school=school,
    )

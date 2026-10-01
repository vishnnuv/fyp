export default function FoodConfirmed({ order }) {
  if (!order) return null;

  return (
    <div className="food-confirmed" role="region" aria-label="Food order confirmation" id="food-order-confirmation">
      <div className="food-confirmed-header">
        <span className="food-confirmed-check" aria-hidden="true">✓</span>
        <div>
          <div className="confirm-title">Food order placed!</div>
          <div className="confirm-pnr">
            Order ID: <span className="confirm-pnr-code">{order.orderId}</span>
          </div>
        </div>
      </div>

      <div className="food-summary-row"><span>PNR</span><strong>{order.pnr}</strong></div>
      <div className="food-summary-row"><span>Train</span><strong>{order.trainName}</strong></div>
      <div className="food-summary-row">
        <span>Delivery stop</span>
        <strong>{order.station} · arrives {order.arrivalTime}</strong>
      </div>

      <div className="food-summary-items">
        {(order.items || []).map((item, index) => (
          <div className="food-summary-item" key={item.key || `${item.name}-${index}`}>
            <span>{item.name}</span>
            <span>₹{item.price}</span>
          </div>
        ))}
      </div>

      <div className="food-summary-total">
        <span>Total</span>
        <strong>₹{order.total}</strong>
      </div>

      <div className="confirm-mock-payment" aria-label="Payment status">
        <span>🍽️</span>
        <span>Pay at delivery (Demo Mode)</span>
      </div>
    </div>
  );
}

export default function FoodSummary({ summary, actions }) {
  if (!summary) return null;

  return (
    <div className="food-summary" role="region" aria-label="Food order summary" id="food-order-summary">
      <div className="food-summary-title">Order summary</div>

      <div className="food-summary-row">
        <span>PNR</span>
        <strong>{summary.pnr}</strong>
      </div>
      <div className="food-summary-row">
        <span>Train</span>
        <strong>{summary.trainName}</strong>
      </div>
      <div className="food-summary-row">
        <span>Delivery stop</span>
        <strong>{summary.station} · arrives {summary.arrivalTime}</strong>
      </div>

      <div className="food-summary-items">
        {(summary.items || []).map((item, index) => (
          <div className="food-summary-item" key={item.key || `${item.name}-${index}`}>
            <span>{item.name}</span>
            <span>₹{item.price}</span>
          </div>
        ))}
      </div>

      <div className="food-summary-total">
        <span>Total</span>
        <strong>₹{summary.total}</strong>
      </div>

      <div className="food-summary-actions">
        <button
          className="select-btn"
          onClick={() => actions?.confirmOrder && actions.confirmOrder()}
          aria-label="Place the food order"
          id="confirm-food-order"
        >
          Yes, place order
        </button>
        <button
          className="secondary-btn"
          onClick={() => actions?.changeItems && actions.changeItems()}
          aria-label="Change selected items"
        >
          Change items
        </button>
        <button
          className="secondary-btn"
          onClick={() => actions?.cancelOrder && actions.cancelOrder()}
          aria-label="Cancel the food order"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

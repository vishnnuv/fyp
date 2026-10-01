import { useState } from 'react';

export default function FoodMenu({ menu = [], stop, actions, selectedKeys = [] }) {
  const [checked, setChecked] = useState(() => new Set(selectedKeys));

  const toggle = (key) => {
    setChecked((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selected = menu.filter((item) => checked.has(item.key));
  const indices = selected.map((item) => menu.indexOf(item));
  const total = selected.reduce((sum, item) => sum + item.price, 0);

  return (
    <div className="food-menu">
      {stop && (
        <div className="food-menu-context">
          Delivery at <strong>{stop.station}</strong> · arrives {stop.arrival_time}
        </div>
      )}
      <div className="food-menu-items" role="group" aria-label="Food menu">
        {menu.map((item) => (
          <label
            className={`food-menu-item${checked.has(item.key) ? ' selected' : ''}`}
            key={item.key}
          >
            <input
              type="checkbox"
              checked={checked.has(item.key)}
              onChange={() => toggle(item.key)}
              aria-label={`Select ${item.name}`}
            />
            <span className="food-menu-name">{item.name}</span>
            <span className="food-menu-price">₹{item.price}</span>
          </label>
        ))}
      </div>
      <div className="food-menu-footer">
        <span className="food-menu-total">
          {selected.length} item{selected.length === 1 ? '' : 's'} selected · ₹{total}
        </span>
        <button
          className="select-btn"
          disabled={selected.length === 0}
          onClick={() => actions?.submitItems && actions.submitItems(indices)}
          aria-label="Add selected items to order"
          id="food-add-to-order"
        >
          Add to order
        </button>
      </div>
    </div>
  );
}

const products = [
  {
    id: "classic",
    mark: "MB",
    name: "Classic Milk Bread",
    description: "A tall pullman loaf with a tender milk crumb and gentle sweetness.",
    price: 180,
    image: "assets/classic-milk-bread.png"
  },
  {
    id: "honey",
    mark: "HB",
    name: "Honey Butter Loaf",
    description: "Soft milk bread enriched with honey and cultured butter.",
    price: 220,
    image: "assets/honey-butter-loaf.png"
  },
  {
    id: "matcha",
    mark: "MA",
    name: "Matcha Azuki Loaf",
    description: "A fragrant green tea loaf folded with sweet red beans.",
    price: 260,
    image: "assets/matcha-azuki-loaf.png"
  }
];

const deliveryFee = 80;
const quantities = Object.fromEntries(products.map(product => [product.id, 0]));
const productGrid = document.querySelector("#productGrid");
const summaryItems = document.querySelector("#summaryItems");
const subtotalEl = document.querySelector("#subtotal");
const deliveryFeeEl = document.querySelector("#deliveryFee");
const totalEl = document.querySelector("#total");
const itemCountEl = document.querySelector("#itemCount");
const orderForm = document.querySelector("#orderForm");
const formStatus = document.querySelector("#formStatus");

if (!productGrid || !orderForm) {
  throw new Error("Order page elements are missing.");
}

const money = new Intl.NumberFormat("th-TH", {
  style: "currency",
  currency: "THB",
  maximumFractionDigits: 0
});

function formatMoney(value) {
  return money.format(value).replace("THB", "฿").trim();
}

function renderProducts() {
  productGrid.innerHTML = products.map(product => `
    <article class="product-card">
      <img class="product-photo" src="${product.image}" alt="${product.name} on a warm bakery counter">
      <div>
        <h3>${product.name}</h3>
        <p>${product.description}</p>
      </div>
      <div class="price-row">
        <span>Per loaf</span>
        <strong>${formatMoney(product.price)}</strong>
      </div>
      <div class="quantity-row">
        <span>Quantity</span>
        <div class="quantity-control" aria-label="${product.name} quantity">
          <button type="button" data-action="decrease" data-id="${product.id}" aria-label="Remove one ${product.name}">-</button>
          <span id="qty-${product.id}">0</span>
          <button type="button" data-action="increase" data-id="${product.id}" aria-label="Add one ${product.name}">+</button>
        </div>
      </div>
    </article>
  `).join("");
}

function selectedItems() {
  return products
    .filter(product => quantities[product.id] > 0)
    .map(product => ({
      id: product.id,
      name: product.name,
      quantity: quantities[product.id],
      unitPrice: product.price,
      subtotal: product.price * quantities[product.id],
      subtotalFormatted: formatMoney(product.price * quantities[product.id])
    }));
}

function renderSummary() {
  const items = selectedItems();
  const subtotal = items.reduce((sum, item) => sum + item.subtotal, 0);
  const total = subtotal > 0 ? subtotal + deliveryFee : 0;
  const count = items.reduce((sum, item) => sum + item.quantity, 0);

  summaryItems.innerHTML = items.length
    ? items.map(item => `
      <div class="summary-item">
        <span>${item.quantity} x ${item.name}</span>
        <strong>${item.subtotalFormatted}</strong>
      </div>
    `).join("")
    : "<p class=\"summary-item\">Choose your loaves to see the total.</p>";

  products.forEach(product => {
    document.querySelector(`#qty-${product.id}`).textContent = quantities[product.id];
  });

  itemCountEl.textContent = `${count} ${count === 1 ? "item" : "items"}`;
  subtotalEl.textContent = formatMoney(subtotal);
  deliveryFeeEl.textContent = subtotal > 0 ? formatMoney(deliveryFee) : formatMoney(0);
  totalEl.textContent = formatMoney(total);

  return { items, subtotal, total, count };
}

productGrid.addEventListener("click", event => {
  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const { action, id } = button.dataset;
  quantities[id] = Math.max(0, quantities[id] + (action === "increase" ? 1 : -1));
  renderSummary();
});

orderForm.addEventListener("submit", async event => {
  event.preventDefault();
  const summary = renderSummary();

  if (summary.count === 0) {
    formStatus.textContent = "Please choose at least one loaf first.";
    return;
  }

  const formData = new FormData(orderForm);
  const order = {
    customerName: formData.get("customerName").trim(),
    phone: formData.get("phone").trim(),
    address: formData.get("address").trim(),
    deliveryDate: formData.get("deliveryDate"),
    deliveryWindow: formData.get("deliveryWindow"),
    note: formData.get("note").trim(),
    items: summary.items.map(item => ({
      ...item,
      subtotal: item.subtotalFormatted
    })),
    subtotal: summary.subtotal,
    total: summary.total,
    totalFormatted: formatMoney(summary.total)
  };

  formStatus.textContent = "Sending your order...";

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(order)
    });
    const result = await response.json();

    if (!response.ok) throw new Error(result.message || "Order could not be sent.");

    const alertText = result.alert.sent
      ? "A phone alert was sent to the bakery."
      : "Order saved. Phone alerts are in demo mode until SMS settings are added.";
    formStatus.textContent = `Thank you. Order ${result.orderId} is confirmed. ${alertText}`;
    orderForm.reset();
    Object.keys(quantities).forEach(id => {
      quantities[id] = 0;
    });
    renderSummary();
  } catch (error) {
    formStatus.textContent = error.message;
  }
});

function setDefaultDate() {
  const input = orderForm.querySelector("input[name='deliveryDate']");
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  input.min = tomorrow.toISOString().slice(0, 10);
  input.value = input.min;
}

renderProducts();
setDefaultDate();
renderSummary();

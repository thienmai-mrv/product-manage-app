import { useEffect, useState } from "react";
import { requestJson } from "../api.js";

const emptyForm = {
  mode: "add",
  id: "",
  name: "",
  sku: "",
  price: "",
  categoryId: "",
  description: "",
  imageUrl: "",
  quantity: "1",
};

/**
 * Format a price for the table.
 *
 * @param price Stored price
 * @return Price text
 */
function money(price) {
  return Number(price).toFixed(2);
}

/**
 * Render the product table and editor.
 *
 * @return Product page
 */
export default function Products() {
  const [items, setItems] = useState([]);
  const [categories, setCategories] = useState([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [cart, setCart] = useState({});

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const [productBody, categoryBody] = await Promise.all([
          requestJson("/api/products", { fallback: "Could not load products" }),
          requestJson("/api/categories", { fallback: "Could not load categories" }),
        ]);
        if (cancelled) {
          return;
        }
        setItems(Array.isArray(productBody.items) ? productBody.items : []);
        setCategories(Array.isArray(categoryBody.items) ? categoryBody.items : []);
        setLoaded(true);
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Could not load products");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Open a blank add form.
   */
  function openAdd() {
    setError("");
    setForm({
      ...emptyForm,
      categoryId: categories[0]?.id || "",
    });
  }

  /**
   * Open the edit form for one product.
   *
   * @param item Product row
   */
  function openEdit(item) {
    setError("");
    setForm({
      mode: "edit",
      id: item.id,
      name: item.name || "",
      sku: item.sku || "",
      price: item.price ?? "",
      categoryId: item.categoryId || "",
      description: item.description || "",
      imageUrl: item.imageUrl || "",
      quantity: item.quantity ?? 0,
    });
  }

  /**
   * Update one field in the open form.
   *
   * @param field Field name
   * @param value Field value
   */
  function updateForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  /**
   * Save the open form as a new or updated product.
   *
   * @param event Submit event
   */
  async function saveForm(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    if (!form.categoryId) {
      setError("Category is required");
      return;
    }
    const quantity = Number(form.quantity);
    if (!Number.isInteger(quantity) || quantity < 0) {
      setError("Quantity must be a whole number that is zero or greater");
      return;
    }
    const imageUrl = form.imageUrl.trim();
    if (imageUrl) {
      try {
        const url = new URL(imageUrl);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("bad protocol");
        }
      } catch {
        setError("Image must be an http or https URL");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const body = await requestJson(form.mode === "add" ? "/api/products" : `/api/products/${form.id}`, {
        method: form.mode === "add" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        fallback: "Could not save the product",
        body: JSON.stringify({
          name: form.name,
          sku: form.sku,
          price: form.price,
          categoryId: form.categoryId,
          description: form.description,
          imageUrl,
          quantity,
        }),
      });
      setItems((current) => {
        if (form.mode === "add") {
          return [body.item, ...current];
        }
        return current.map((item) => (item.id === form.id ? body.item : item));
      });
      setForm(null);
    } catch (saveError) {
      setError(saveError.message || "Could not save the product");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Delete one product after confirmation.
   *
   * @param item Product row
   */
  async function removeItem(item) {
    if (!window.confirm(`Delete ${item.name}?`)) {
      return;
    }
    setDeletingId(item.id);
    setError("");
    try {
      await requestJson(`/api/products/${item.id}`, {
        method: "DELETE",
        fallback: "Could not delete the product",
      });
      setItems((current) => current.filter((row) => row.id !== item.id));
      setCart((current) => {
        if (!current[item.id]) {
          return current;
        }
        const next = { ...current };
        delete next[item.id];
        return next;
      });
      if (form?.id === item.id) {
        setForm(null);
      }
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete the product");
    } finally {
      setDeletingId("");
    }
  }

  /**
   * Add one unit of a product to the in-memory cart.
   * The cart cannot exceed the product's stored quantity.
   *
   * @param item Product row
   */
  function addToCart(item) {
    setError("");
    setCart((current) => {
      const inCart = current[item.id] || 0;
      if (inCart >= item.quantity) {
        return current;
      }
      return { ...current, [item.id]: inCart + 1 };
    });
  }

  const cartCount = Object.values(cart).reduce((sum, count) => sum + count, 0);
  const cartLines = items.filter((item) => cart[item.id]);

  return (
    <>
      {error && <p className="message error">{error}</p>}
      <section className="cart-summary" aria-label="Cart">
        <h2>Cart</h2>
        <p className="cart-count">{cartCount} items</p>
        {cartLines.length === 0 ? <p className="cart-empty">No products in the cart.</p> : null}
        {cartLines.length > 0 ? (
          <ul className="cart-lines">
            {cartLines.map((item) => (
              <li key={item.id}>
                {item.imageUrl ? <img className="product-thumb" src={item.imageUrl} alt="" /> : null}
                <span>{item.name}</span>
                <span>{cart[item.id]}</span>
                <button type="button" className="secondary" onClick={() => {
                  setCart((current) => {
                    const next = { ...current };
                    delete next[item.id];
                    return next;
                  });
                }}
                >
                  Remove
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </section>
      <div className="toolbar">
        <button type="button" className="primary" onClick={openAdd}>
          Add
        </button>
      </div>
      {form && (
        <form className="config-form" onSubmit={saveForm}>
          <label>
            Name
            <input value={form.name} onChange={(event) => updateForm("name", event.target.value)} />
          </label>
          <label>
            SKU
            <input value={form.sku} onChange={(event) => updateForm("sku", event.target.value)} />
          </label>
          <label>
            Price
            <input
              type="number"
              min="0"
              step="0.01"
              value={form.price}
              onChange={(event) => updateForm("price", event.target.value)}
            />
          </label>
          <label>
            Category
            <select value={form.categoryId} onChange={(event) => updateForm("categoryId", event.target.value)}>
              {categories.length === 0 && <option value="">No categories</option>}
              {categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Description
            <textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
          </label>
          <label>
            Product Image
            <input
              type="url"
              inputMode="url"
              placeholder="https://"
              value={form.imageUrl}
              onChange={(event) => updateForm("imageUrl", event.target.value)}
            />
          </label>
          <label>
            Quantity
            <input
              type="number"
              min="0"
              step="1"
              value={form.quantity}
              onChange={(event) => updateForm("quantity", event.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="submit" className="primary" disabled={saving}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" className="secondary" onClick={() => setForm(null)} disabled={saving}>
              Cancel
            </button>
          </div>
        </form>
      )}
      <div className="table-wrap">
        <table className="config-table product-table">
          <thead>
            <tr>
              <th className="col-no">No</th>
              <th className="col-name">Name</th>
              <th className="col-sku">SKU</th>
              <th className="col-category">Category</th>
              <th className="col-price">Price</th>
              <th className="col-image">Image</th>
              <th className="col-quantity">Quantity</th>
              <th>Description</th>
              <th className="col-action">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="col-no">{index + 1}</td>
                <td className="col-name">{item.name}</td>
                <td className="col-sku">{item.sku}</td>
                <td className="col-category">{item.categoryName}</td>
                <td className="col-price">{money(item.price)}</td>
                <td className="col-image">
                  {item.imageUrl ? <img className="product-thumb" src={item.imageUrl} alt="" /> : "—"}
                </td>
                <td className="col-quantity">{item.quantity ?? 0}</td>
                <td>
                  <span className="cell-ellipsis" title={item.description}>
                    {item.description}
                  </span>
                </td>
                <td className="col-action">
                  <div className="row-actions">
                    <button
                      type="button"
                      className="primary"
                      onClick={() => addToCart(item)}
                      disabled={(cart[item.id] || 0) >= (item.quantity || 0)}
                    >
                      Add to Cart
                    </button>
                    <button type="button" className="secondary" onClick={() => openEdit(item)}>
                      Edit
                    </button>
                    <button
                      type="button"
                      className="danger"
                      onClick={() => removeItem(item)}
                      disabled={deletingId === item.id}
                    >
                      {deletingId === item.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {loaded && items.length === 0 && (
              <tr>
                <td className="empty" colSpan={9}>
                  No products yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}

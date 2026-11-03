import { useEffect, useRef, useState } from "react";
import { requestJson } from "../api.js";
import { displayImageSrc } from "../productImage.js";
import ActionIcon from "./ActionIcon.jsx";
import ProductImage from "./ProductImage.jsx";

const MAX_IMAGE_BYTES = 1048576;
const MAX_IMAGE_URL_LENGTH = 2048;
const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const emptyForm = {
  mode: "add",
  id: "",
  name: "",
  sku: "",
  price: "",
  categoryId: "",
  description: "",
  imageUrl: "",
  imageFile: null,
  keptImageUrl: "",
  imageCleared: false,
  quantity: "1",
  published: true,
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
 * Return true when the value is an http or https URL.
 *
 * @param value Raw URL
 * @return True for an external image URL
 */
function isHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

/**
 * Return true when the value is this app's upload image path.
 *
 * @param value Stored image URL
 * @return True for an upload path
 */
function isUploadPath(value) {
  return /^\/api\/products\/[^/]+\/image$/.test(value);
}

/**
 * Encode a file as standard base64 with no data: prefix.
 *
 * @param file Selected file
 * @return Base64 text
 */
async function fileToBase64(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

/**
 * Build the DOM src for a stored product image.
 *
 * @param item Product row
 * @return Display URL
 */
function productImageSrc(item) {
  return displayImageSrc(item.imageUrl, item.updatedAt || item.createdAt);
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
  const [publishingId, setPublishingId] = useState("");
  const fileInputRef = useRef(null);

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
   * Drop the selected file from the form and the file control.
   */
  function resetFileInput() {
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  /**
   * Open a blank add form.
   */
  function openAdd() {
    setError("");
    resetFileInput();
    setForm({
      ...emptyForm,
      categoryId: categories[0]?.id || "",
    });
  }

  /**
   * Open the edit form for one product.
   * An upload path stays in state and is not shown in the URL field.
   *
   * @param item Product row
   */
  function openEdit(item) {
    setError("");
    resetFileInput();
    const storedImage = item.imageUrl || "";
    setForm({
      mode: "edit",
      id: item.id,
      name: item.name || "",
      sku: item.sku || "",
      price: item.price ?? "",
      categoryId: item.categoryId || "",
      description: item.description || "",
      imageUrl: isHttpUrl(storedImage) ? storedImage : "",
      imageFile: null,
      keptImageUrl: isUploadPath(storedImage) ? storedImage : "",
      imageCleared: false,
      quantity: item.quantity ?? 0,
      published: item.published !== false,
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
   * Store a selected file and clear the URL text.
   *
   * @param event File input event
   */
  function onImageFile(event) {
    const file = event.target.files?.[0] ?? null;
    setForm((current) => ({
      ...current,
      imageFile: file,
      imageUrl: file ? "" : current.imageUrl,
    }));
  }

  /**
   * Store a typed URL and clear any selected file.
   *
   * @param value URL text
   */
  function onImageUrl(value) {
    if (value.trim()) {
      resetFileInput();
    }
    setForm((current) => ({
      ...current,
      imageUrl: value,
      imageFile: value.trim() ? null : current.imageFile,
    }));
  }

  /**
   * Drop both the file and the URL, including a kept upload path.
   */
  function clearImage() {
    resetFileInput();
    setForm((current) => (current ? {
      ...current,
      imageUrl: "",
      imageFile: null,
      keptImageUrl: "",
      imageCleared: true,
    } : current));
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
    const urlText = form.imageUrl.trim();
    const file = form.imageFile;
    if (file && urlText) {
      setError("Choose an image file or an image URL, not both");
      return;
    }
    if (urlText.length > MAX_IMAGE_URL_LENGTH) {
      setError("Image URL is too long");
      return;
    }
    if (urlText) {
      try {
        const url = new URL(urlText);
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error("bad protocol");
        }
      } catch {
        setError("Image must be an http or https URL");
        return;
      }
    }
    if (file) {
      if (file.size === 0) {
        setError("Image file is empty");
        return;
      }
      if (file.size > MAX_IMAGE_BYTES) {
        setError("Image file must be 1 MB or smaller");
        return;
      }
      if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
        setError("Image file must be PNG, JPEG, WebP, or GIF");
        return;
      }
    }
    setSaving(true);
    setError("");
    try {
      const payload = {
        name: form.name,
        sku: form.sku,
        price: form.price,
        categoryId: form.categoryId,
        description: form.description,
        quantity,
        published: form.published === true,
        imageUrl: "",
      };
      if (file) {
        payload.imageFile = {
          contentType: file.type,
          dataBase64: await fileToBase64(file),
        };
      } else if (urlText) {
        payload.imageUrl = urlText;
      } else if (form.mode === "edit" && form.keptImageUrl && !form.imageCleared) {
        payload.imageUrl = form.keptImageUrl;
      }
      const body = await requestJson(form.mode === "add" ? "/api/products" : `/api/products/${form.id}`, {
        method: form.mode === "add" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        fallback: "Could not save the product",
        body: JSON.stringify(payload),
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
   * Switch one product between in stock and out of stock.
   * The body keeps the current image and does not send a file.
   *
   * @param item Product row
   */
  async function toggleStock(item) {
    setPublishingId(item.id);
    setError("");
    try {
      const body = await requestJson(`/api/products/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        fallback: "Could not save the product",
        body: JSON.stringify({
          name: item.name,
          sku: item.sku ?? "",
          price: item.price,
          categoryId: item.categoryId,
          description: item.description ?? "",
          quantity: item.quantity ?? 0,
          published: item.published !== false,
          inStock: item.inStock === false,
          imageUrl: item.imageUrl || "",
        }),
      });
      setItems((current) => current.map((row) => (row.id === item.id ? body.item : row)));
    } catch (stockError) {
      setError(stockError.message || "Could not save the product");
    } finally {
      setPublishingId("");
    }
  }

  /**
   * Publish or unpublish one product through the existing update route.
   * The body keeps the current image and does not send a file.
   *
   * @param item Product row
   */
  async function togglePublished(item) {
    setPublishingId(item.id);
    setError("");
    try {
      const body = await requestJson(`/api/products/${item.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        fallback: "Could not save the product",
        body: JSON.stringify({
          name: item.name,
          sku: item.sku ?? "",
          price: item.price,
          categoryId: item.categoryId,
          description: item.description ?? "",
          quantity: item.quantity ?? 0,
          published: item.published === false,
          imageUrl: item.imageUrl || "",
        }),
      });
      setItems((current) => current.map((row) => (row.id === item.id ? body.item : row)));
      setForm((current) => {
        if (!current || current.id !== item.id) {
          return current;
        }
        return { ...current, published: body.item.published !== false };
      });
    } catch (publishError) {
      setError(publishError.message || "Could not save the product");
    } finally {
      setPublishingId("");
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
      if (form?.id === item.id) {
        setForm(null);
      }
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete the product");
    } finally {
      setDeletingId("");
    }
  }

  return (
    <>
      {error && <p className="message error">{error}</p>}
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
            Image file
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              onChange={onImageFile}
            />
          </label>
          <label>
            Product Image
            <input
              type="url"
              inputMode="url"
              placeholder="https://"
              value={form.imageUrl}
              onChange={(event) => onImageUrl(event.target.value)}
            />
          </label>
          <div className="form-actions">
            <button type="button" className="secondary" onClick={clearImage} disabled={saving}>
              Clear image
            </button>
          </div>
          <label>
            Published
            <input
              type="checkbox"
              checked={form.published === true}
              onChange={(event) => updateForm("published", event.target.checked)}
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
              <th className="col-description">Description</th>
              <th className="col-status">Status</th>
              <th className="col-stock">Stock</th>
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
                  <ProductImage
                    imageUrl={productImageSrc(item)}
                    className="product-thumb"
                    placeholderClassName="product-thumb"
                  />
                </td>
                <td className="col-quantity">{item.quantity ?? 0}</td>
                <td>
                  <span className="cell-ellipsis" title={item.description}>
                    {item.description}
                  </span>
                </td>
                <td className="col-status">{item.published === false ? "Unpublished" : "Published"}</td>
                <td className="col-stock">{item.inStock === false ? "Out of Stock" : "In Stock"}</td>
                <td className="col-action">
                  <div className="row-actions">
                    <button
                      type="button"
                      className="secondary icon-button"
                      aria-label={item.inStock === false ? "Mark in stock" : "Mark out of stock"}
                      title={item.inStock === false ? "Mark in stock" : "Mark out of stock"}
                      onClick={() => toggleStock(item)}
                      disabled={publishingId === item.id}
                    >
                      <ActionIcon name={item.inStock === false ? "in-stock" : "out-of-stock"} />
                    </button>
                    <button
                      type="button"
                      className="secondary icon-button"
                      aria-label={item.published === false ? "Publish" : "Unpublish"}
                      title={item.published === false ? "Publish" : "Unpublish"}
                      onClick={() => togglePublished(item)}
                      disabled={publishingId === item.id}
                    >
                      <ActionIcon name={item.published === false ? "publish" : "unpublish"} />
                    </button>
                    <button
                      type="button"
                      className="secondary icon-button"
                      aria-label="Edit"
                      title="Edit"
                      onClick={() => openEdit(item)}
                    >
                      <ActionIcon name="edit" />
                    </button>
                    <button
                      type="button"
                      className="danger icon-button"
                      aria-label="Delete"
                      title="Delete"
                      onClick={() => removeItem(item)}
                      disabled={deletingId === item.id}
                    >
                      <ActionIcon name="delete" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {loaded && items.length === 0 && (
              <tr>
                <td className="empty" colSpan={11}>
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

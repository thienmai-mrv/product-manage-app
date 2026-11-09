import { useEffect, useState } from "react";
import { requestJson } from "../api.js";
import ActionIcon from "./ActionIcon.jsx";
import LoadingState from "./LoadingState.jsx";

const emptyForm = { mode: "add", id: "", name: "", description: "" };

/**
 * Render the brand table and editor.
 *
 * @return Brand page
 */
export default function Brands() {
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [form, setForm] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const body = await requestJson("/api/brands", { fallback: "Could not load brands" });
        if (!cancelled) {
          setItems(Array.isArray(body.items) ? body.items : []);
          setLoaded(true);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Could not load brands");
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
    setForm(emptyForm);
  }

  /**
   * Open the edit form for one brand.
   *
   * @param item Brand row
   */
  function openEdit(item) {
    setError("");
    setForm({
      mode: "edit",
      id: item.id,
      name: item.name || "",
      description: item.description || "",
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
   * Save the open form as a new or updated brand.
   *
   * @param event Submit event
   */
  async function saveForm(event) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError("");
    try {
      const body = await requestJson(form.mode === "add" ? "/api/brands" : `/api/brands/${form.id}`, {
        method: form.mode === "add" ? "POST" : "PUT",
        headers: { "Content-Type": "application/json" },
        fallback: "Could not save the brand",
        body: JSON.stringify({
          name: form.name,
          description: form.description,
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
      setError(saveError.message || "Could not save the brand");
    } finally {
      setSaving(false);
    }
  }

  /**
   * Delete one brand after confirmation.
   *
   * @param item Brand row
   */
  async function removeItem(item) {
    if (!window.confirm(`Delete ${item.name}?`)) {
      return;
    }
    setDeletingId(item.id);
    setError("");
    try {
      await requestJson(`/api/brands/${item.id}`, {
        method: "DELETE",
        fallback: "Could not delete the brand",
      });
      setItems((current) => current.filter((row) => row.id !== item.id));
      if (form?.id === item.id) {
        setForm(null);
      }
    } catch (deleteError) {
      setError(deleteError.message || "Could not delete the brand");
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
            Description
            <textarea value={form.description} onChange={(event) => updateForm("description", event.target.value)} />
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
      {!loaded && !error ? <LoadingState label="Loading brands…" /> : null}
      {loaded || error ? (
      <div className="table-wrap">
        <table className="config-table category-table">
          <thead>
            <tr>
              <th className="col-no">No</th>
              <th className="col-name">Name</th>
              <th>Description</th>
              <th className="col-count">Products</th>
              <th className="col-action">Action</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={item.id}>
                <td className="col-no">{index + 1}</td>
                <td className="col-name">{item.name}</td>
                <td>
                  <span className="cell-ellipsis" title={item.description}>
                    {item.description}
                  </span>
                </td>
                <td className="col-count">{item.productCount}</td>
                <td className="col-action">
                  <div className="row-actions">
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
                <td className="empty" colSpan={5}>
                  No brands yet.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      ) : null}
    </>
  );
}

import { useEffect, useMemo, useState } from "react";
import { requestJson } from "../api.js";
import { clearChip, createFilterState, viewCatalog } from "../catalogView.js";
import FilterPanel from "./FilterPanel.jsx";
import ProductPanel from "./ProductPanel.jsx";

/**
 * Render the storefront dashboard.
 * Products load once. Filter changes stay in memory and do not call the API.
 *
 * @return Dashboard element
 */
export default function Dashboard() {
  const [items, setItems] = useState([]);
  const [status, setStatus] = useState("loading");
  const [error, setError] = useState("");
  const [filters, setFilters] = useState(createFilterState);
  const [savedIds, setSavedIds] = useState(() => new Set());

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const body = await requestJson("/api/products", { fallback: "Could not load products" });
        if (cancelled) {
          return;
        }
        setItems(Array.isArray(body.items) ? body.items : []);
        setStatus("ready");
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError.message || "Could not load products");
          setStatus("error");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const view = useMemo(() => viewCatalog(items, filters), [items, filters]);

  /**
   * Select one sort radio.
   *
   * @param sort Sort id
   */
  function changeSort(sort) {
    setFilters((current) => ({ ...current, sort }));
  }

  /**
   * Toggle the In Stock Only control.
   */
  function toggleInStock() {
    setFilters((current) => ({ ...current, inStockOnly: !current.inStockOnly }));
  }

  /**
   * Add or remove one price range.
   *
   * @param id Price range id
   */
  function togglePrice(id) {
    setFilters((current) => ({
      ...current,
      priceRangeIds: current.priceRangeIds.includes(id)
        ? current.priceRangeIds.filter((item) => item !== id)
        : [...current.priceRangeIds, id],
    }));
  }

  /**
   * Add or remove one color.
   *
   * @param id Color id
   */
  function toggleColor(id) {
    setFilters((current) => ({
      ...current,
      colorIds: current.colorIds.includes(id)
        ? current.colorIds.filter((item) => item !== id)
        : [...current.colorIds, id],
    }));
  }

  /**
   * Expand or collapse one filter section.
   *
   * @param section `availability`, `price`, or `color`
   */
  function toggleSection(section) {
    setFilters((current) => ({
      ...current,
      collapsed: {
        ...current.collapsed,
        [section]: !current.collapsed[section],
      },
    }));
  }

  /**
   * Remove one active chip.
   *
   * @param chip Chip model
   */
  function removeChip(chip) {
    setFilters((current) => clearChip(current, chip));
  }

  /**
   * Toggle the in-memory heart for one product.
   * The set is dropped on navigation, reload, and unmount.
   *
   * @param id Product id
   */
  function toggleSaved(id) {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  return (
    <div className="dashboard">
      <FilterPanel
        state={filters}
        priceCounts={view.priceCounts}
        onSort={changeSort}
        onToggleInStock={toggleInStock}
        onTogglePrice={togglePrice}
        onToggleColor={toggleColor}
        onToggleSection={toggleSection}
      />
      <ProductPanel
        status={status}
        error={error}
        view={view}
        savedIds={savedIds}
        onToggleSaved={toggleSaved}
        onRemoveChip={removeChip}
      />
    </div>
  );
}

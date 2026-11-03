import { PRICE_RANGES, SORT_OPTIONS } from "../catalogView.js";

/**
 * Render one collapsible filter section.
 * Collapsing hides the controls and does not clear their selection.
 *
 * @param props.id Section id used for aria-controls
 * @param props.title Visible heading
 * @param props.collapsed True when the controls are hidden
 * @param props.onToggle Toggle handler
 * @param props.children Section controls
 * @return Section element
 */
function FilterSection({ id, title, collapsed, onToggle, children }) {
  const panelId = `filter-${id}`;
  return (
    <section className="filter-section">
      <h2 className="filter-heading">
        <button
          type="button"
          className="section-toggle"
          aria-expanded={!collapsed}
          aria-controls={panelId}
          onClick={() => onToggle(id)}
        >
          <span>{title}</span>
          <span aria-hidden="true">{collapsed ? "+" : "−"}</span>
        </button>
      </h2>
      <div id={panelId} className="filter-body" hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}

/**
 * Render the sort, availability, price, and category controls.
 * The panel is controlled by the dashboard. It does not decide which products match.
 *
 * @param props.state Filter state
 * @param props.priceCounts Whole-catalog bucket counts
 * @param props.categories Categories available for filtering
 * @param props.onSort Sort change handler
 * @param props.onToggleInStock Availability handler
 * @param props.onTogglePrice Price checkbox handler
 * @param props.onToggleCategory Category checkbox handler
 * @param props.onToggleSection Collapse handler
 * @return Filter panel
 */
export default function FilterPanel({
  state,
  priceCounts,
  categories,
  onSort,
  onToggleInStock,
  onTogglePrice,
  onToggleCategory,
  onToggleSection,
}) {
  const selectedPrices = new Set(state.priceRangeIds);
  const selectedCategories = new Set(state.categoryIds);

  return (
    <aside className="filter-panel">
      <fieldset className="filter-section sort-section">
        <legend className="filter-heading">Sort</legend>
        <div className="sort-options">
          {SORT_OPTIONS.map((option) => (
            <label key={option.id} className="sort-option">
              <input
                type="radio"
                name="catalog-sort"
                value={option.id}
                checked={state.sort === option.id}
                onChange={() => onSort(option.id)}
              />
              <span>{option.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <FilterSection
        id="availability"
        title="Availability"
        collapsed={state.collapsed.availability}
        onToggle={onToggleSection}
      >
        <button
          type="button"
          className="stock-toggle"
          aria-pressed={state.inStockOnly}
          onClick={onToggleInStock}
        >
          In Stock Only
        </button>
      </FilterSection>

      <FilterSection
        id="price"
        title="Price"
        collapsed={state.collapsed.price}
        onToggle={onToggleSection}
      >
        {PRICE_RANGES.map((range) => (
          <label key={range.id} className="price-row">
            <input
              type="checkbox"
              checked={selectedPrices.has(range.id)}
              onChange={() => onTogglePrice(range.id)}
            />
            <span>{range.label}</span>
            <span className="price-count">{priceCounts[range.id] ?? 0}</span>
          </label>
        ))}
      </FilterSection>

      <FilterSection
        id="category"
        title="Categories"
        collapsed={state.collapsed.category}
        onToggle={onToggleSection}
      >
        {categories.length === 0 ? <p className="message">No categories yet.</p> : null}
        {categories.map((category) => (
          <label key={category.id} className="price-row">
            <input
              type="checkbox"
              checked={selectedCategories.has(category.id)}
              onChange={() => onToggleCategory(category.id)}
            />
            <span>{category.name}</span>
          </label>
        ))}
      </FilterSection>
    </aside>
  );
}

import { formatPrice } from "../catalogView.js";
import { displayImageSrc } from "../productImage.js";
import ProductImage from "./ProductImage.jsx";

/**
 * Build the card image URL. Upload paths include a display-only version query.
 *
 * @param product Catalog product
 * @return Image src
 */
function cardImageSrc(product) {
  return displayImageSrc(product.imageUrl, product.updatedAt || product.createdAt);
}

/**
 * Draw a shopping bag for the BUY NOW control.
 *
 * @return Decorative SVG
 */
function BagIcon() {
  return (
    <svg className="bag-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6.5 8h11l-1 12h-9l-1-12z" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 8V7a3 3 0 0 1 6 0v1" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

/**
 * Draw an outline or filled heart.
 *
 * @param props.filled True when the product is saved in this session
 * @return Decorative SVG
 */
function HeartIcon({ filled }) {
  return (
    <svg className="heart-icon" viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M12 19.5s-6.5-4.1-6.5-8.2a3.6 3.6 0 0 1 6.5-2 3.6 3.6 0 0 1 6.5 2c0 4.1-6.5 8.2-6.5 8.2z"
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * Render the first matching product as the tall caption tile.
 * The tile has no price, heart, or BUY NOW control.
 *
 * @param props.product Featured product
 * @return Featured tile
 */
function FeaturedTile({ product }) {
  return (
    <article className="product-card product-card-featured">
      <div className="image-well image-well-featured">
        <ProductImage imageUrl={cardImageSrc(product)} />
      </div>
      <div className="featured-caption">
        {product.categoryName ? <p className="featured-category">{product.categoryName}</p> : null}
        <p className="featured-name">{product.name}</p>
      </div>
    </article>
  );
}

/**
 * Render one standard catalog card.
 *
 * @param props.product Product after the featured tile
 * @param props.saved True when the heart is pressed
 * @param props.onToggleSaved Heart click handler
 * @return Product card
 */
function ProductCard({ product, saved, onToggleSaved }) {
  return (
    <article className="product-card">
      <div className="image-well">
        <ProductImage imageUrl={cardImageSrc(product)} />
        <button
          type="button"
          className={saved ? "heart is-saved" : "heart"}
          aria-pressed={saved}
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name}`}
          onClick={() => onToggleSaved(product.id)}
        >
          <HeartIcon filled={saved} />
        </button>
      </div>
      {product.categoryName ? <p className="card-collection">{product.categoryName}</p> : null}
      <p className="card-name">{product.name}</p>
      <p className="card-price">{formatPrice(product.price)}</p>
      <button type="button" className="buy-now" aria-label={`Buy ${product.name} now`}>
        <BagIcon />
        <span>BUY NOW</span>
      </button>
    </article>
  );
}

/**
 * Render the result count, chips, and the product grid.
 *
 * @param props.status `loading`, `ready`, or `error`
 * @param props.error Error text from the product request
 * @param props.view Result of `viewCatalog`
 * @param props.savedIds Product ids whose hearts are pressed
 * @param props.onToggleSaved Heart click handler
 * @param props.onRemoveChip Chip click handler
 * @return Product panel
 */
export default function ProductPanel({
  status,
  error,
  view,
  savedIds,
  onToggleSaved,
  onRemoveChip,
}) {
  return (
    <section className="product-panel" aria-label="Products">
      {status === "loading" ? <p className="message">Loading products…</p> : null}
      {status === "error" ? <p className="message error">{error}</p> : null}
      {status === "ready" ? (
        <>
          <div className="product-header">
            <p className="result-count">{view.count} items</p>
            <div className="chip-list">
              {view.chips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  className="filter-chip"
                  aria-label={`Remove ${chip.label}`}
                  onClick={() => onRemoveChip(chip)}
                >
                  {chip.label} ×
                </button>
              ))}
            </div>
          </div>
          {view.catalogCount === 0 ? <p className="message">No products yet.</p> : null}
          {view.catalogCount > 0 && view.count === 0 ? (
            <p className="message">No products match the selected filters.</p>
          ) : null}
          {view.featured ? (
            <div className="product-grid">
              <FeaturedTile product={view.featured} />
              {view.cards.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                  saved={savedIds.has(product.id)}
                  onToggleSaved={onToggleSaved}
                />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}

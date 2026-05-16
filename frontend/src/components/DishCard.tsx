import type { Dish } from "@shared/types";

export default function DishCard({ dish }: { dish: Dish }) {
  const { name, imageUrl, priceInr } = dish;
  const { name: restaurantName, rating, etaMinutes, swiggyUrl } = dish.restaurant;
  return (
    <a
      href={swiggyUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-stretch gap-3 p-3 w-full bg-white border-hairline border-border rounded-card no-underline"
    >
      <img
        src={imageUrl}
        alt={name}
        loading="lazy"
        decoding="async"
        className="w-22.5 h-22.5 object-cover rounded-card flex-shrink-0"
      />
      <div className="flex flex-col justify-between min-w-0">
        <div>
          <p className="text-text-primary font-semibold truncate">{name}</p>
          <p className="text-text-secondary text-sm truncate">{restaurantName}</p>
        </div>
        <div className="flex items-center gap-1 text-2xs text-text-secondary">
          <span
            className="inline-block w-2 h-2 rounded-full bg-rating"
            aria-hidden
          />
          <span>{rating.toFixed(1)}</span>
          <span>·</span>
          <span>{etaMinutes} min</span>
          <span>·</span>
          <span>₹{priceInr}</span>
        </div>
      </div>
    </a>
  );
}

import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  horizontalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import type { Card } from "@online-rummy/shared";
import { useAppStore } from "../store";
import CardComponent from "./Card";

interface SortableCardProps {
  card: Card;
  selected: boolean;
  mustMeld: boolean;
}

function SortableCard({ card, selected, mustMeld }: SortableCardProps) {
  const toggle = useAppStore((s) => s.toggleSelect);
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: card.id });

  const transformCss = transform
    ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: transformCss,
        transition,
        opacity: isDragging ? 0.4 : 1,
        zIndex: isDragging ? 10 : undefined,
      }}
      {...attributes}
      {...listeners}
    >
      <CardComponent
        card={card}
        selected={selected}
        onClick={() => toggle(card.id)}
        {...(mustMeld
          ? {
              style: {
                outline: "3px solid #ffd166",
                outlineOffset: 1,
                borderRadius: 6,
              },
            }
          : {})}
      />
    </div>
  );
}

export default function Hand() {
  const privateState = useAppStore((s) => s.privateState);
  const publicState = useAppStore((s) => s.publicState);
  const handOrder = useAppStore((s) => s.handOrder);
  const selectedCardIds = useAppStore((s) => s.selectedCardIds);
  const setHandOrder = useAppStore((s) => s.setHandOrder);
  const mustMeldCardId =
    publicState?.variantPublic.variant === 'rum500'
      ? publicState.variantPublic.data.mustMeldCardId
      : null;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } })
  );

  if (!privateState) return null;

  const cardMap = new Map(privateState.hand.map((c) => [c.id, c]));
  const ordered = handOrder
    .map((id) => cardMap.get(id))
    .filter((c): c is Card => c !== undefined);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIdx = handOrder.indexOf(active.id as string);
      const newIdx = handOrder.indexOf(over.id as string);
      if (oldIdx !== -1 && newIdx !== -1) {
        setHandOrder(arrayMove(handOrder, oldIdx, newIdx));
      }
    }
  }

  return (
    <div
      style={{
        background: "rgba(0,0,0,0.2)",
        borderRadius: 8,
        padding: "12px 16px",
      }}
    >
      <div
        style={{
          fontSize: 11,
          color: "rgba(255,255,255,0.6)",
          marginBottom: 8,
          textTransform: "uppercase",
          letterSpacing: 1,
        }}
      >
        Your Hand ({ordered.length})
      </div>
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={handOrder}
          strategy={horizontalListSortingStrategy}
        >
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {ordered.map((card) => (
              <SortableCard
                key={card.id}
                card={card}
                selected={selectedCardIds.includes(card.id)}
                mustMeld={card.id === mustMeldCardId}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}

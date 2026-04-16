import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { crmApiError, getKanban, moveLead, reorderLeads } from "../../api/crmService";
import type { CrmKanbanCard, CrmKanbanResponse } from "../crmTypes";
import CrmPipelinePicker from "../components/CrmPipelinePicker.jsx";
import { useCrmStore } from "../crmStore";

const cKey = (stageId: number) => `c-${stageId}`;
const lKey = (leadId: number) => `l-${leadId}`;

function parseC(k: string | number) {
  return Number(String(k).replace(/^c-/, ""));
}
function parseL(k: string | number) {
  return Number(String(k).replace(/^l-/, ""));
}

function findContainer(itemId: string | number, board: Record<string, string[]>) {
  const id = String(itemId);
  if (Object.prototype.hasOwnProperty.call(board, id)) return id;
  return Object.keys(board).find((key) => board[key].includes(id)) ?? null;
}

function buildBoardState(data: CrmKanbanResponse) {
  const items: Record<string, string[]> = {};
  const cards: Record<number, CrmKanbanCard> = {};
  for (const col of data.columns) {
    const key = cKey(col.stage.id);
    items[key] = col.leads.map((l) => lKey(l.id));
    for (const l of col.leads) cards[l.id] = l;
  }
  return { items, cards };
}

function KanbanCardBody({ card }: { card: CrmKanbanCard }) {
  return (
    <>
      <div className="crm-kanban-card-name">{card.nome}</div>
      {card.empresa ? <div className="crm-muted">{card.empresa}</div> : null}
      <div className="crm-muted" style={{ marginTop: 6, fontSize: "0.75rem" }}>
        {card.responsavel?.nome ? `Resp.: ${card.responsavel.nome}` : "Sem responsável"}
        {card.valor_estimado != null && card.valor_estimado !== ""
          ? ` · R$ ${Number(card.valor_estimado).toLocaleString("pt-BR", { minimumFractionDigits: 0 })}`
          : ""}
      </div>
      {Array.isArray(card.tags) && card.tags.length > 0 ? (
        <div className="crm-tag-row">
          {card.tags.slice(0, 4).map((t) => (
            <span
              key={t.id}
              className="crm-tag-pill"
              style={t.cor ? { background: `${t.cor}22`, color: t.cor } : undefined}
            >
              {t.nome ?? t.id}
            </span>
          ))}
        </div>
      ) : null}
    </>
  );
}

function ColumnBody({ stageId, children }: { stageId: number; children: ReactNode }) {
  const { setNodeRef } = useDroppable({ id: cKey(stageId) });
  return (
    <div ref={setNodeRef} className="crm-kanban-col-body" data-stage-id={stageId}>
      {children}
    </div>
  );
}

function SortableLeadCard({ card }: { card: CrmKanbanCard }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: lKey(card.id),
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.45 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`crm-kanban-card ${isDragging ? "crm-kanban-card--drag" : ""}`}
      {...attributes}
      {...listeners}
    >
      <KanbanCardBody card={card} />
    </div>
  );
}

export default function CrmKanban() {
  const pipelineId = useCrmStore((s) => s.pipelineId);
  const refreshTick = useCrmStore((s) => s.refreshTick);
  const [kanban, setKanban] = useState<CrmKanbanResponse | null>(null);
  const [items, setItems] = useState<Record<string, string[]>>({});
  const [cards, setCards] = useState<Record<number, CrmKanbanCard>>({});
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [activeDrag, setActiveDrag] = useState<CrmKanbanCard | null>(null);
  const snapshotRef = useRef<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setErr("");
      const params = pipelineId != null ? { pipeline_id: pipelineId } : {};
      const data = await getKanban(params);
      setKanban(data);
      const b = buildBoardState(data);
      setItems(b.items);
      setCards(b.cards);
    } catch (e) {
      setErr(crmApiError(e));
      setKanban(null);
    } finally {
      setLoading(false);
    }
  }, [pipelineId]);

  useEffect(() => {
    load();
  }, [load, refreshTick]);

  const onDragStart = (event: DragStartEvent) => {
    const id = event.active?.id;
    if (id == null) return;
    snapshotRef.current = JSON.stringify(itemsRef.current);
    const lid = parseL(id as string);
    setActiveDrag(cards[lid] ?? null);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    setItems((prev) => {
      const activeContainer = findContainer(active.id, prev);
      const overContainer = findContainer(over.id, prev);
      if (!activeContainer || !overContainer || activeContainer === overContainer) return prev;

      const activeItems = [...prev[activeContainer]];
      const overItems = [...prev[overContainer]];
      const activeIndex = activeItems.indexOf(String(active.id));
      if (activeIndex === -1) return prev;
      const moved = activeItems[activeIndex];
      const nextActive = activeItems.filter((x) => x !== moved);
      const overId = String(over.id);
      let newIndex: number;
      if (Object.prototype.hasOwnProperty.call(prev, overId)) {
        newIndex = overItems.length;
      } else {
        const overIndex = overItems.indexOf(overId);
        newIndex = overIndex >= 0 ? overIndex : overItems.length;
      }
      const nextOver = [...overItems.slice(0, newIndex), moved, ...overItems.slice(newIndex)];
      return {
        ...prev,
        [activeContainer]: nextActive,
        [overContainer]: nextOver,
      };
    });
  };

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDrag(null);
    const current = itemsRef.current;

    if (!over) {
      if (snapshotRef.current) {
        try {
          setItems(JSON.parse(snapshotRef.current));
        } catch {
          /* ignore */
        }
      }
      snapshotRef.current = null;
      return;
    }

    const activeContainer = findContainer(active.id, current);
    const overContainer = findContainer(over.id, current);
    if (!activeContainer || !overContainer) {
      snapshotRef.current = null;
      return;
    }

    const leadId = parseL(active.id as string);
    const stageSource = parseC(activeContainer);
    const stageDest = parseC(overContainer);
    const pipeline = kanban?.pipeline?.id;

    try {
      if (activeContainer === overContainer) {
        const oldIndex = current[activeContainer].indexOf(String(active.id));
        const newIndex = current[overContainer].indexOf(String(over.id));
        if (oldIndex < 0 || newIndex < 0 || oldIndex === newIndex) {
          snapshotRef.current = null;
          return;
        }
        const next = arrayMove(current[activeContainer], oldIndex, newIndex);
        setItems((prev) => ({ ...prev, [activeContainer]: next }));
        await reorderLeads({
          stage_id: stageSource,
          lead_ids: next.map((x) => parseL(x)),
        });
        snapshotRef.current = null;
        return;
      }

      await moveLead(leadId, {
        stage_id: stageDest,
        ...(pipeline != null ? { pipeline_id: pipeline } : {}),
        retornar_snapshot: true,
      });

      const destOrder = current[overContainer].map((x) => parseL(x));
      const sourceOrder = current[activeContainer].map((x) => parseL(x));

      await reorderLeads({ stage_id: stageDest, lead_ids: destOrder });
      await reorderLeads({ stage_id: stageSource, lead_ids: sourceOrder });
    } catch (e) {
      if (snapshotRef.current) {
        try {
          setItems(JSON.parse(snapshotRef.current));
        } catch {
          /* ignore */
        }
      }
      setErr(crmApiError(e));
    } finally {
      snapshotRef.current = null;
    }
  };

  const columns = kanban?.columns ?? [];

  if (loading && !kanban) {
    return (
      <div className="crm-empty">
        <CrmPipelinePicker />
        <p style={{ marginTop: 16 }}>Carregando quadro…</p>
      </div>
    );
  }

  if (err && !kanban) {
    return (
      <div className="crm-error">
        {err}
        <div style={{ marginTop: 12 }}>
          <button type="button" className="crm-btn crm-btn--primary" onClick={load}>
            Tentar novamente
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="crm-toolbar" style={{ marginBottom: 16 }}>
        <CrmPipelinePicker />
        <button type="button" className="crm-btn crm-btn--outline" onClick={load} disabled={loading}>
          {loading ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {err ? <div className="crm-error" style={{ marginBottom: 12 }}>{err}</div> : null}

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragOver={onDragOver}
        onDragEnd={onDragEnd}
      >
        <div className="crm-kanban-board">
          {columns.map((col) => {
            const cid = cKey(col.stage.id);
            const list = items[cid] ?? [];
            return (
              <div key={col.stage.id} className="crm-kanban-col">
                <div className="crm-kanban-col-hd">
                  <span className="crm-kanban-col-title">{col.stage.nome}</span>
                  <span className="crm-kanban-col-count">{list.length}</span>
                </div>
                <ColumnBody stageId={col.stage.id}>
                  <SortableContext items={list} strategy={verticalListSortingStrategy}>
                    {list.map((lid) => {
                      const id = parseL(lid);
                      const card = cards[id];
                      if (!card) return null;
                      return <SortableLeadCard key={id} card={card} />;
                    })}
                  </SortableContext>
                  {list.length === 0 ? <div className="crm-muted">Arraste um card aqui</div> : null}
                </ColumnBody>
              </div>
            );
          })}
        </div>
        <DragOverlay>
          {activeDrag ? (
            <div className="crm-kanban-card crm-kanban-card--drag">
              <KanbanCardBody card={activeDrag} />
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

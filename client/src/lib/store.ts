import { useCallback, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery } from 'convex/react';
import { api } from '../../../convex/_generated/api';
import type { Id } from '../../../convex/_generated/dataModel';
import type { PlanEvent } from '../types';

/** The signed-in user's events, stored in Convex. */
export interface EventStore {
  ready: boolean;
  events: PlanEvent[];
  /** Apply a change to one event. Returns fn's result right away; saving happens in the background. */
  update: (id: string, fn: (ev: PlanEvent) => string | void) => string | void;
  /** Add an event and resolve with its id. */
  add: (ev: PlanEvent) => Promise<string>;
  /** Delete an event. Rejects if it is the last one. */
  remove: (id: string) => Promise<void>;
  /** Set when a save fails, so the UI can say so. */
  error: string | null;
  clearError: () => void;
}

type EventData = Omit<PlanEvent, 'id'>;

/** Plain data for storage: drops the id and any undefined fields. */
export function toData(ev: PlanEvent): EventData {
  const { id: _id, ...rest } = JSON.parse(JSON.stringify(ev)) as PlanEvent;
  void _id;
  return rest;
}

/** Apply a change to the freshest copy of one event. */
function applyTo(list: PlanEvent[], id: string, fn: (ev: PlanEvent) => string | void) {
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return { next: list, ev: null as PlanEvent | null, result: undefined as string | void };
  const ev = structuredClone(list[i]);
  const result = fn(ev);
  const next = list.slice();
  next[i] = ev;
  return { next, ev, result };
}

/** Use only inside a signed-in part of the tree. */
export function useConvexStore(): EventStore {
  const docs = useQuery(api.events.list, {});
  const create = useMutation(api.events.create);
  const save = useMutation(api.events.save).withOptimisticUpdate((local, args) => {
    const cur = local.getQuery(api.events.list, {});
    if (cur) local.setQuery(api.events.list, {}, cur.map((d) => (d._id === args.id ? { ...d, data: args.data } : d)));
  });
  const removeDoc = useMutation(api.events.remove).withOptimisticUpdate((local, args) => {
    const cur = local.getQuery(api.events.list, {});
    if (cur) local.setQuery(api.events.list, {}, cur.filter((d) => d._id !== args.id));
  });
  const [error, setError] = useState<string | null>(null);

  const events = useMemo<PlanEvent[]>(() => (docs ?? []).map((d) => ({ ...(d.data as EventData), id: d._id })), [docs]);

  // Latest known list, including changes made since the last render.
  const latest = useRef(events);
  const seenDocs = useRef(docs);
  if (seenDocs.current !== docs) {
    seenDocs.current = docs;
    latest.current = events;
  }

  const update = useCallback<EventStore['update']>((id, fn) => {
    const { next, ev, result } = applyTo(latest.current, id, fn);
    if (!ev) return result;
    latest.current = next;
    save({ id: id as Id<'events'>, data: toData(ev) }).catch((e) => {
      console.error('[convex] save failed', e);
      setError('Couldn’t save that change. Check your connection.');
    });
    return result;
  }, [save]);

  const add = useCallback<EventStore['add']>(async (ev) => {
    return await create({ data: toData(ev) });
  }, [create]);

  const remove = useCallback<EventStore['remove']>(async (id) => {
    await removeDoc({ id: id as Id<'events'> });
  }, [removeDoc]);

  return {
    ready: !!docs,
    events,
    update,
    add,
    remove,
    error,
    clearError: useCallback(() => setError(null), []),
  };
}

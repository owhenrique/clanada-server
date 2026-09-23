export function idsFrom(ids: readonly string[]): () => string {
  let index = 0;
  return () => {
    const id = ids[index];
    if (id === undefined) {
      throw new Error("invariant: ran out of recorded ids during replay");
    }
    index++;
    return id;
  };
}

export function recordingIdFactory(nextId: () => string): {
  createId: () => string;
  ids: string[];
} {
  const ids: string[] = [];
  return {
    createId: () => {
      const id = nextId();
      ids.push(id);
      return id;
    },
    ids,
  };
}

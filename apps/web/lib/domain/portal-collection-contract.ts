export type PortalCollectionContext = { tenantId: string; participantId: string } & ({ actorId: string; audience: "parent" } | { audience: "child" });
export type PortalCollectionItem = { id: string; themeKey: string; release: string; itemKey: string; title: string; assetUrl: string | null; foundAt: string };
export type PortalCollectionOffer = { id: string; item: PortalCollectionItem; expiresAt: string; saved: boolean };
export type PortalCollectionResult<T> = { ok: true; value: T } | { ok: false; message: string };
export type PortalCollectionView = { items: PortalCollectionItem[]; canWrite: boolean };

# Frontend Changes Required

Please apply the following changes to `C:\Users\Tecnots User\workspace\tecnots\360Solve-Connector`.

## 1. `lib/types.ts`

Update `ConnectionMethod` and `ConnectionConfig`:

```typescript
export type ConnectionMethod =
  | "credentials"
  | "connection_string"
  | "aggregator"
  | "custom_api"
  | "mini_connector"    // Add this
  | "cloud_connector"   // Add this

export interface ConnectionConfig {
  method: ConnectionMethod
  // ... existing fields
  // Add these:
  connectorId?: string
  table?: string
  columns?: string[]
}
```

## 2. `lib/mock-data.ts`

Add new nodes to `paletteNodes.source`:

```typescript
export const paletteNodes = {
  source: [
    // ... existing
    { id: "node-mini-source", type: "source" as const, label: "Mini Connector", description: "Connect to local agent database", icon: "Server", connectionMethod: "mini_connector" as const },
    { id: "node-cloud-source", type: "source" as const, label: "Cloud Connector", description: "Connect to cloud service", icon: "Cloud", connectionMethod: "cloud_connector" as const },
  ],
  // ...
}
```

## 3. `components/workflow/properties-panel.tsx`

Add handling for `mini_connector` in the `connectionMethod` check:

```tsx
{connectionMethod === "mini_connector" && (
  <div className="space-y-4">
    <div className="rounded-xl border border-blue-500/20 bg-blue-500/5 p-4">
      <div className="flex items-center gap-2 mb-2">
        <Server className="h-4 w-4 text-blue-500" />
        <span className="text-xs font-bold text-blue-500">Local Agent</span>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Connect to a database running on your local network via Mini Connector.
      </p>
    </div>
    
    <button
      onClick={() => {
        // Open modal logic here
        // For now, you can implement a simple prompt or use the new backend API:
        // fetch('/api/connectors/mini/{id}/databases')
        toast.info("Opening Mini Connector Wizard...")
      }}
      className="w-full rounded-lg bg-primary py-2.5 text-xs font-bold text-primary-foreground hover:bg-primary/90"
    >
      Configure Connection
    </button>
  </div>
)}
```

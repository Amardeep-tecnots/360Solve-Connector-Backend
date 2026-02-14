declare module 'machine-id' {
  export function machineIdSync(): string;
  export function machineId(): Promise<string>;
}

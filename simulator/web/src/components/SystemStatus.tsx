import type { SystemStatus } from "../types";

interface Props {
  status: SystemStatus | null;
}

export function SystemStatusBanner({ status }: Props) {
  if (!status) {
    return (
      <div className="sys-banner offline">
        <span className="banner-dot"></span>
        SYSTEM OFFLINE — Backend unreachable. Is the simulator running on :9090?
      </div>
    );
  }

  const { backendOnline, peers = [] } = status;
  const downPeers = peers.filter((p) => !p.online);

  if (!backendOnline) {
    return (
      <div className="sys-banner offline">
        <span className="banner-dot pulse"></span>
        BACKEND OFFLINE — Main Employment Passport API (:8080) is down. Credential operations paused.
      </div>
    );
  }

  if (downPeers.length > 0) {
    return (
      <div className="sys-banner degraded">
        <span className="banner-dot pulse"></span>
        DEGRADED — {downPeers.length} peer(s) offline: {downPeers.map((p) => p.name).join(", ")}. Endorsement policy may fail.
      </div>
    );
  }

  return (
    <div className="sys-banner online">
      <span className="banner-dot"></span>
      SYSTEM ONLINE — Backend ✓ · Orderer ✓ · All {peers.length} peers active. Full consensus.
    </div>
  );
}
import React, { useState } from "react";
import { DeviceFormModal } from "../../components/inventory/DeviceFormModal";

export const DeviceFormPreviewPage: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className="min-h-screen bg-[#080c14] flex items-center justify-center p-4">
      <DeviceFormModal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        initialData={{
          protocol: "SNMP",
          snmpConfig: {
            version: "v2c",
            port: 161,
            community: "public_monitor",
            oid: "1.3.6.1.2.1.1.3.0",
            securityLevel: "authPriv",
            timeoutSeconds: 5,
          },
        }}
        onSubmit={async (data) => {
          console.log("Submit:", data);
        }}
      />
    </div>
  );
};

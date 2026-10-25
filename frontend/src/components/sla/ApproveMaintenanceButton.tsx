import React, { useState } from "react";
import { CheckCircle2, Loader2 } from "lucide-react";
import { Button } from "../ui";

interface ApproveMaintenanceButtonProps {
  maintenanceId: string;
  rfcNumber: string;
  onApprove: (id: string) => Promise<void>;
  disabled?: boolean;
}

export const ApproveMaintenanceButton: React.FC<ApproveMaintenanceButtonProps> = ({
  maintenanceId,
  rfcNumber,
  onApprove,
  disabled = false,
}) => {
  const [isApproving, setIsApproving] = useState(false);

  const handleClick = async () => {
    try {
      setIsApproving(true);
      await onApprove(maintenanceId);
    } finally {
      setIsApproving(false);
    }
  };

  return (
    <Button
      type="button"
      onClick={handleClick}
      disabled={disabled || isApproving}
      variant="primary"
      size="sm"
      icon={
        isApproving ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <CheckCircle2 size={14} />
        )
      }
      title={`Homologar Isenção de SLA para ${rfcNumber}`}
    >
      {isApproving ? "Homologando..." : "Homologar Isenção Agora"}
    </Button>
  );
};

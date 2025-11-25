import { AlertCircle, X } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

interface BackdateBannerProps {
  visible: boolean;
  onClose: () => void;
  message?: string;
}

/**
 * BackdateBanner - baner informujący o korektach historycznych
 *
 * Wyświetlany po wykryciu zmian w przeszłych miesiącach (backdate).
 * Dismissowalny - po zamknięciu znika do końca sesji.
 */
export function BackdateBanner({ visible, onClose, message }: BackdateBannerProps) {
  if (!visible) return null;

  return (
    <Alert className="mb-6 bg-yellow-50 border-yellow-300" role="alert">
      <AlertCircle className="size-4 text-yellow-600" aria-hidden="true" />
      <AlertDescription className="flex items-start justify-between gap-4">
        <span className="flex-1 text-sm text-yellow-800">
          {message || "Wykryto korekty historyczne. Dashboard został zaktualizowany."}
        </span>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="size-6 hover:bg-yellow-100"
          aria-label="Zamknij powiadomienie"
        >
          <X className="size-4 text-yellow-600" />
        </Button>
      </AlertDescription>
    </Alert>
  );
}

'use client';

import { useEffect, useRef, useState } from 'react';
import { sendGAEvent } from '@next/third-parties/google';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface CalendlyModalProps {
  isOpen: boolean;
  onClose: () => void;
  url: string;
  title?: string;
}

declare global {
  interface Window {
    Calendly: {
      // eslint-disable-next-line no-unused-vars
      initInlineWidget: (options: {
        url: string;
        parentElement: HTMLElement;
        prefill?: Record<string, any>;
        utm?: Record<string, any>;
      }) => void;
      closePopupWidget: () => void;
    };
  }
}

export const CalendlyModal = ({
  isOpen,
  onClose,
  url,
  title = 'Book a Call',
}: CalendlyModalProps) => {
  const calendlyRef = useRef<HTMLDivElement>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let timeoutId: ReturnType<typeof setTimeout>;

    const initializeCalendly = () => {
      if (calendlyRef.current && window.Calendly) {
        try {
          // Clear any existing content
          calendlyRef.current.innerHTML = '';

          // Initialize Calendly widget
          window.Calendly.initInlineWidget({
            url,
            parentElement: calendlyRef.current,
          });

          setIsLoading(false);
          setError(null);
        } catch {
          setError('Failed to load Calendly widget');
          setIsLoading(false);
        }
      } else if (isOpen) {
        // Retry after a short delay
        timeoutId = setTimeout(initializeCalendly, 100);
      }
    };

    const loadCalendlyScript = () => {
      const existing = document.getElementById('calendly-widget-script');
      if (existing) {
        initializeCalendly();

        return;
      }

      const script = document.createElement('script');
      script.id = 'calendly-widget-script';
      script.src = 'https://assets.calendly.com/assets/external/widget.js';
      script.async = true;
      script.onload = initializeCalendly;
      script.onerror = () => {
        setError('Failed to load Calendly widget');
        setIsLoading(false);
      };
      document.body.appendChild(script);
    };

    if (isOpen) {
      // Track modal open event
      sendGAEvent({
        event: 'calendly_modal_open',
        value: title,
        modal_action: 'open',
        event_category: 'engagement',
        event_label: 'calendly_booking',
      });

      setIsLoading(true);
      setError(null);
      loadCalendlyScript();
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [isOpen, url, title]);

  const handleClose = () => {
    // Track modal close event
    sendGAEvent({
      event: 'calendly_modal_close',
      value: title,
      modal_action: 'close',
      event_category: 'engagement',
      event_label: 'calendly_booking',
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && handleClose()} modal>
      <DialogContent className="max-h-[95vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0 md:max-h-[90vh] md:w-full">
        <DialogHeader className="border-b p-4 pb-3 md:p-6 md:pb-4">
          <DialogTitle className="text-lg font-semibold md:text-xl">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div
          className="relative w-full px-2 pb-4 md:px-4 md:pb-6"
          style={{
            height: '500px',
            minHeight: '500px',
          }}
        >
          {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="flex flex-col items-center gap-2">
                <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-[#7BB6DD]" />
                <p className="text-sm text-gray-600">Loading calendar...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="absolute inset-0 flex items-center justify-center bg-white">
              <div className="p-4 text-center">
                <p className="mb-2 text-red-600">{error}</p>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-lg bg-gradient-to-r from-[#7BB6DD] to-[#5BA4D1] px-4 py-2 text-white transition-all duration-200 hover:shadow-lg hover:shadow-[#7BB6DD]/20"
                >
                  Open Calendly in new tab
                </a>
              </div>
            </div>
          )}

          <div
            ref={calendlyRef}
            className="h-full w-full"
            style={{
              display: isLoading || error ? 'none' : 'block',
            }}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
};

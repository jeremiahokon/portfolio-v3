'use client';

import { useReportWebVitals } from 'next/web-vitals';
import { sendGAEvent } from '@next/third-parties/google';

import { GA_EVENTS } from '@/lib/analytics-events';

// Reports Core Web Vitals from real visits into GA4, replacing the one-off manual Lighthouse audit this site relied on before.
export function WebVitalsReporter() {
  useReportWebVitals((metric) => {
    sendGAEvent({
      event: GA_EVENTS.WEB_VITAL_REPORTED,
      value: metric.value,
      metric_name: metric.name,
      metric_value: metric.value,
      metric_rating: metric.rating,
      metric_id: metric.id,
    });
  });

  return null;
}

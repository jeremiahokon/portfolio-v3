// Central registry of GA4 event names.
//
// GA4 constraints: event names max 40 chars, [a-z0-9_], must start with a letter.
// Convention: user_<verb>_<element>_on_<location> — the location lives in the
// name itself so every event is distinguishable in GA reports without
// cross-filtering params. Dynamic values (link id, project name, video id, …)
// stay in event params, never in the name.
export const GA_EVENTS = {
  // Book-a-call CTAs
  BOOK_CALL_ON_HERO: 'user_clicked_book_call_on_hero',
  BOOK_CALL_ON_CONTACT: 'user_clicked_book_call_on_contact',
  BOOK_CALL_ON_FOOTER: 'user_clicked_book_call_on_footer',
  BOOK_CALL_ON_STICKY_BAR: 'user_clicked_book_call_on_sticky_bar',
  BOOK_CALL_CTA: {
    tools_page: 'user_clicked_book_call_on_tools_page',
    extract_audio: 'user_clicked_book_call_on_extract_audio',
    video_to_subtitles: 'user_clicked_book_call_on_video_to_subtitles',
  },

  // Email
  EMAIL_ON_HEADER: 'user_clicked_email_on_header',
  EMAIL_ON_CONTACT: 'user_clicked_email_on_contact',
  EMAIL_ON_FOOTER: 'user_clicked_email_on_footer',

  // Navigation
  NAV_LINK_ON_HEADER: 'user_clicked_nav_link_on_header',
  NAV_LINK_ON_MOBILE_MENU: 'user_clicked_nav_link_on_mobile_menu',

  // Calendly modal lifecycle
  CALENDLY_MODAL_OPENED: 'user_opened_calendly_modal',
  CALENDLY_MODAL_CLOSED: 'user_closed_calendly_modal',

  // Upwork proof links
  UPWORK_STATS_ON_HERO: 'user_clicked_upwork_stats_on_hero',
  UPWORK_BADGE_ON_HERO: 'user_clicked_upwork_badge_on_hero',
  UPWORK_STAT_ON_STATS: 'user_clicked_upwork_stat_on_stats',
  UPWORK_ON_TESTIMONIALS: 'user_clicked_upwork_on_testimonials',

  // Social / content
  SOCIAL_LINK_ON_FOOTER: 'user_clicked_social_link_on_footer',
  YOUTUBE_ON_CONTENT_SECTION: 'user_clicked_youtube_on_content_section',
  TIKTOK_ON_CONTENT_SECTION: 'user_clicked_tiktok_on_content_section',
  SHORT_PLAYED_ON_CONTENT: 'user_played_short_on_content_section',
  FEATURED_VIDEO_PLAYED: 'user_played_featured_video_on_content',

  // Projects
  CASE_CARD_ON_RECENT_WORKS: 'user_clicked_case_card_on_recent_works',
  CASE_LINK_ON_RECENT_WORKS: 'user_clicked_case_link_on_recent_works',
  PROJECT_ON_RECENT_WORKS: 'user_clicked_project_on_recent_works',

  // Free tools
  TOOL_CARD_ON_TOOLS_PAGE: 'user_clicked_tool_card_on_tools_page',
  OPEN_EXTRACTOR_ON_BANNER: 'user_clicked_open_extractor_on_banner',
  BROWSE_TOOLS_ON_BANNER: 'user_clicked_browse_tools_on_banner',

  // Audio extractor funnel
  EXTRACTOR_FILE_SELECTED: 'user_selected_video_on_extractor',
  EXTRACTOR_SUCCESS: 'user_extracted_audio_successfully',
  EXTRACTOR_FAILED: 'user_failed_extraction_on_extractor',
  EXTRACTOR_MP3_DOWNLOADED: 'user_downloaded_mp3_on_extractor',

  // Subtitle generator funnel. MODEL_GATE_REACHED is the one that matters most:
  // it marks the point where a ~170 MB download is disclosed, so the drop-off
  // between it and MODEL_READY is the real cost of running the model on-device.
  SUBTITLER_FILE_SELECTED: 'user_selected_file_on_subtitler',
  SUBTITLER_MODEL_GATE_REACHED: 'user_reached_model_gate_on_subtitler',
  SUBTITLER_MODEL_READY: 'user_loaded_model_on_subtitler',
  SUBTITLER_SUCCESS: 'user_generated_subtitles_successfully',
  SUBTITLER_FAILED: 'user_failed_transcription_on_subtitler',
  SUBTITLER_EXPORTED: 'user_downloaded_subtitles_on_subtitler',
  SUBTITLER_CANCELLED: 'user_cancelled_job_on_subtitler',
} as const;

export type BookCallCtaLocation = keyof typeof GA_EVENTS.BOOK_CALL_CTA;

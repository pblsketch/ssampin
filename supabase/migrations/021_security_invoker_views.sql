-- 021: Security Definer → Security Invoker 전환
-- Supabase Security Advisor 경고 해소
-- admin 페이지는 service_role 키로 조회하므로 영향 없음

-- Analytics 뷰 (9개)
ALTER VIEW public.analytics_total_users SET (security_invoker = true);
ALTER VIEW public.analytics_version_distribution SET (security_invoker = true);
ALTER VIEW public.analytics_tool_ranking_weekly SET (security_invoker = true);
ALTER VIEW public.analytics_tool_ranking SET (security_invoker = true);
ALTER VIEW public.analytics_export_formats SET (security_invoker = true);
ALTER VIEW public.analytics_daily_active SET (security_invoker = true);
ALTER VIEW public.analytics_weekly_summary SET (security_invoker = true);
ALTER VIEW public.analytics_retention SET (security_invoker = true);
ALTER VIEW public.analytics_session_duration SET (security_invoker = true);

-- Chatbot 분석 뷰 (10개)
ALTER VIEW public.chatbot_session_depth SET (security_invoker = true);
ALTER VIEW public.chatbot_avoidable_escalations SET (security_invoker = true);
ALTER VIEW public.chatbot_depth_distribution SET (security_invoker = true);
ALTER VIEW public.chatbot_low_confidence_conversations SET (security_invoker = true);
ALTER VIEW public.chatbot_popular_topics SET (security_invoker = true);
ALTER VIEW public.chatbot_daily_stats SET (security_invoker = true);
ALTER VIEW public.chatbot_unanswered_topics SET (security_invoker = true);
ALTER VIEW public.chatbot_confidence_stats SET (security_invoker = true);
ALTER VIEW public.chatbot_recent_escalations SET (security_invoker = true);
ALTER VIEW public.chatbot_escalation_stats SET (security_invoker = true);

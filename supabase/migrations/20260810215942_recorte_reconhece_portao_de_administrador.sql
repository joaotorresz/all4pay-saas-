-- ⚠️ O classificador acusou SETE tabelas `maq_*` de "insert/update/delete sem
-- recorte". A política delas é `maq_is_admin()` — um portão por papel, tão
-- recorte quanto `auth_org_id()`. O classificador é que não o conhecia e caía
-- em 'outro', e 'outro' virava achado Alto.
--
-- Sete falsos Altos de uma vez: exatamente o defeito que esta onda começou
-- corrigindo, reaparecendo dentro do conserto. O padrão `%_is_admin%` cobre
-- `maq_is_admin` e `org_is_admin` de uma vez, em vez de enumerar nomes — lista
-- de nomes envelhece na primeira função nova, e envelhecer aqui significa
-- voltar a acusar quem está certo.
--
-- ⚠️ A ordem dos testes MUDOU junto: `usuário` (auth.uid()) desceu para depois
-- de `papel` e `administrador`. Uma política que chama `tem_permissao()` cita
-- `auth.uid()` por dentro, e no primeiro `case` que casasse ela seria
-- classificada pelo critério menos específico.
create or replace function public._recorte(expr text)
returns text
language sql
immutable
as $$
  select case
    when expr is null                              then 'sem condição'
    when expr ilike '%auth_org_id()%'              then 'empresa'
    when expr ilike '%organization_members%'       then 'vínculo'
    when expr ilike '%is_platform_admin%'
      or expr ilike '%admin_veredito%'
      or expr ilike '%\_is\_admin%'                then 'administrador'
    when expr ilike '%tem_permissao%'              then 'papel'
    when expr ilike '%auth.uid()%'                 then 'usuário'
    when btrim(lower(expr)) = 'true'               then 'ABERTO'
    when btrim(lower(expr)) = 'false'              then 'fechado'
    else 'outro'
  end;
$$;

revoke all on function public._recorte(text) from public;
grant execute on function public._recorte(text) to authenticated;

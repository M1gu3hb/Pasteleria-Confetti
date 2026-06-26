-- El público (anon) no debe generar folios. EXECUTE de siguiente_folio solo para el POS.
revoke execute on function siguiente_folio(text, uuid) from anon, public;
grant execute on function siguiente_folio(text, uuid) to authenticated;

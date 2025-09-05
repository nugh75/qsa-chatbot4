from __future__ import annotations

"""AI sottoagente per tabelle dati.

Dato un intento dell'utente e risultati già filtrati delle tabelle,
produce un testo sintetico e pertinente in italiano usando un provider
e un modello configurabili (indipendenti dalla personalità principale).
"""
from typing import Any, Dict, List, Optional, Tuple
import re
import os
from datetime import datetime

from .admin import load_config
from .database import db_manager, USING_POSTGRES
from .data_tables import get_table, get_rows
from .data_tables import search_tables  # fallback rich search across rows
from .llm import chat_with_provider


DEFAULT_SETTINGS = {
    "enabled": True,
    "provider": "openrouter",
    "model": None,  # lascia che chat_with_provider risolva il default/provider-selected
    "temperature": 0.2,
    "limit_per_table": 8,
    # Prompt di sistema personalizzabile (se non fornito, usa il default sotto)
    "system_prompt": None,
}


def get_settings() -> Dict[str, Any]:
    cfg = load_config()
    return {**DEFAULT_SETTINGS, **(cfg.get("data_tables_settings") or {})}


def build_system_prompt() -> str:
    """Restituisce il prompt di sistema per il sottoagente.

    Ordine di priorità:
    1) Variabile d'ambiente DATA_TABLES_AGENT_SYSTEM_PROMPT (se non vuota)
    2) Campo config data_tables_settings.system_prompt (se non vuoto)
    3) Prompt di default codificato di seguito
    """
    try:
        env_prompt = os.getenv('DATA_TABLES_AGENT_SYSTEM_PROMPT')  # type: ignore[name-defined]
    except Exception:
        env_prompt = None
    if isinstance(env_prompt, str) and env_prompt.strip():
        return env_prompt
    try:
        settings = get_settings()
        custom = settings.get('system_prompt')
        if isinstance(custom, str) and custom.strip():
            return custom
    except Exception:
        pass
    # Default storico
    return (
        "Sei un assistente dati. Riceverai: (1) la domanda dell'utente e (2) gli schemi delle tabelle disponibili (nome colonne).\n"
        "Compito: proponi query strutturate (nessun SQL libero) come JSON:\n"
        "[{\"table_id\": str, \"conditions\":[{\"column\":str,\"op\":\"contains|equals|gte|lte|gt|lt|between|month|weekday\",\"type\":\"text|number|date\",\"value\":any}], \"order_by\":{\"column\":str,\"direction\":\"asc|desc\"}, \"limit\": int}]\n"
        "Indicazioni:\n- Usa solo colonne dichiarate.\n- type è facoltativo ma consigliato: number/date evitano ambiguità.\n- Per date usa SEMPRE formato italiano DD/MM/YYYY.\n- between accetta [from,to] oppure {from:.., to:..}.\n- month accetta nome mese IT (es. 'settembre') o numero '09' (richiede type=date).\n- weekday accetta giorno IT (es. 'venerdì', 'sabato') o abbreviazione ('ven','sab').\n- limit <= 50.\n- Se non serve interrogare, restituisci [].\n"
    )

def _collect_schemas(table_ids: List[str]) -> List[Dict[str, Any]]:
    schemas: List[Dict[str, Any]] = []
    for tid in table_ids:
        t = get_table(tid)
        if not t:
            continue
        schemas.append({
            "table_id": tid,
            "title": t.get('title') or t.get('name') or tid,
            "columns": t.get('columns') or []
        })
    return schemas

def _format_schemas_for_prompt(schemas: List[Dict[str, Any]]) -> str:
    parts = []
    for s in schemas:
        cols = ', '.join(s.get('columns') or [])
        parts.append(f"- {s.get('table_id')} ({s.get('title')}): {cols}")
    return "\n".join(parts)

def _execute_query_spec(table_id: str, spec: Dict[str, Any], limit_default: int = 20) -> Tuple[List[str], List[Dict[str, Any]]]:
    tmeta = get_table(table_id)
    if not tmeta:
        return [], []
    columns = tmeta.get('columns') or []
    col_map = {str(c): str(c) for c in columns}
    col_map_ci = {str(c).lower(): str(c) for c in columns}  # case-insensitive lookup
    limit = int(spec.get('limit') or limit_default)
    limit = max(1, min(limit, 100))
    # Validate conditions
    conds = []
    for c in (spec.get('conditions') or []):
        raw_col = c.get('column')
        col = None
        if isinstance(raw_col, str):
            col = col_map.get(raw_col) or col_map_ci.get(raw_col.lower())
        if not col:
            continue
        op = (c.get('op') or 'contains').lower()
        val = c.get('value')
        typ = (c.get('type') or '').lower() if isinstance(c.get('type'), str) else ''
        conds.append((col, op, val, typ))

    rows_data: List[Dict[str, Any]] = []
    if USING_POSTGRES and conds:
        # Build JSONB query on data_table_rows
        where_parts = ['table_id = %s']
        params: List[Any] = [table_id]
        MONTHS = {
            'gennaio':'01','febbraio':'02','marzo':'03','aprile':'04','maggio':'05','giugno':'06',
            'luglio':'07','agosto':'08','settembre':'09','ottobre':'10','novembre':'11','dicembre':'12'
        }
        WEEKDAYS = {
            'lunedì':'1','lunedi':'1','lun':'1',
            'martedì':'2','martedi':'2','mar':'2',
            'mercoledì':'3','mercoledi':'3','mer':'3',
            'giovedì':'4','giovedi':'4','gio':'4',
            'venerdì':'5','venerdi':'5','ven':'5',
            'sabato':'6','sab':'6',
            'domenica':'7','dom':'7'
        }
        # Helper: robust PG expression that parses date from DD/MM/YYYY or YYYY-MM-DD*
        def _pg_date_expr(col: str) -> Tuple[str, List[Any]]:
            expr = (
                "CASE "
                "WHEN (data->>%s) ~ '^\\d{2}/\\d{2}/\\d{4}$' THEN to_date(data->>%s,'DD/MM/YYYY') "
                "WHEN (data->>%s) ~ '^\\d{4}-\\d{2}-\\d{2}' THEN to_date(substring(data->>%s from '^\\d{4}-\\d{2}-\\d{2}'),'YYYY-MM-DD') "
                "ELSE NULL END"
            )
            return expr, [col, col, col, col]
        for (col, op, val, typ) in conds:
            if op == 'equals':
                sval = str(val or '')
                if typ == 'date':
                    dexpr, extra = _pg_date_expr(col)
                    where_parts.append(f"({dexpr}) = to_date(%s,'DD/MM/YYYY')")
                    params.extend(extra + [sval])
                elif typ == 'number':
                    where_parts.append("(((data->>%s) ~ '^[0-9]+(\\.[0-9]+)?$') AND (data->>%s)::numeric = %s::numeric)")
                    params.extend([col, col, sval])
                else:
                    where_parts.append(f"(data->>%s) = %s")
                    params.extend([col, sval])
            elif op == 'contains':
                where_parts.append(f"LOWER(data->>%s) LIKE LOWER(%s)")
                params.extend([col, f"%{str(val or '')}%"]) 
            elif op in ('gte','lte','gt','lt','between'):
                # detect date vs number by value pattern
                def is_iso_date(s: str) -> bool:
                    return bool(re.match(r'^\d{4}-\d{2}-\d{2}$', s))
                comparator = {'gte': '>=', 'lte': '<=', 'gt': '>', 'lt': '<'}
                if op == 'between':
                    v1, v2 = None, None
                    if isinstance(val, (list, tuple)) and len(val) >= 2:
                        v1, v2 = str(val[0]), str(val[1])
                    elif isinstance(val, dict):
                        v1, v2 = str(val.get('from','')), str(val.get('to',''))
                    if v1 and v2 and (typ=='date' or (is_iso_date(v1) and is_iso_date(v2))):
                        dexpr, extra = _pg_date_expr(col)
                        where_parts.append(f"({dexpr}) BETWEEN to_date(%s,'DD/MM/YYYY') AND to_date(%s,'DD/MM/YYYY')")
                        params.extend(extra + [v1, v2])
                    elif v1 and v2:
                        where_parts.append("(((data->>%s) ~ '^[0-9]+(\\.[0-9]+)?$') AND (data->>%s)::numeric BETWEEN %s::numeric AND %s::numeric)")
                        params.extend([col, col, v1, v2])
                else:
                    sval = str(val or '')
                    if typ=='date' or is_iso_date(sval):
                        dexpr, extra = _pg_date_expr(col)
                        where_parts.append(f"({dexpr}) {comparator[op]} to_date(%s,'DD/MM/YYYY')")
                        params.extend(extra + [sval])
                    else:
                        where_parts.append(f"(((data->>%s) ~ '^[0-9]+(\\.[0-9]+)?$') AND (data->>%s)::numeric {comparator[op]} %s::numeric)")
                        params.extend([col, col, sval])
            elif op == 'month':
                sval = str(val or '')
                mm = MONTHS.get(sval.lower(), None)
                if not mm and re.match(r'^\d{1,2}$', sval):
                    mm = sval.zfill(2)
                mm = mm or sval
                # match either ISO date month or textual month presence
                if typ == 'date':
                    dexpr, extra = _pg_date_expr(col)
                    where_parts.append(f"({dexpr}) IS NOT NULL AND to_char(({dexpr}), 'MM') = %s")
                    params.extend(extra + extra + [mm])
                else:
                    # tenta sia su data effettiva che su stringa contenente il mese
                    dexpr, extra = _pg_date_expr(col)
                    where_parts.append(f"((({dexpr}) IS NOT NULL AND to_char(({dexpr}), 'MM') = %s) OR LOWER(data->>%s) LIKE LOWER(%s))")
                    params.extend(extra + extra + [mm, col, f"%{sval}%"]) 
            elif op == 'weekday':
                sval = str(val or '')
                dd = WEEKDAYS.get(sval.lower()) or sval
                if typ == 'date':
                    dexpr, extra = _pg_date_expr(col)
                    where_parts.append(f"({dexpr}) IS NOT NULL AND to_char(({dexpr}), 'ID') = %s")
                    params.extend(extra + extra + [dd])
                else:
                    dexpr, extra = _pg_date_expr(col)
                    where_parts.append(f"( (({dexpr}) IS NOT NULL AND to_char(({dexpr}), 'ID') = %s) OR LOWER(data->>%s) LIKE LOWER(%s) )")
                    params.extend(extra + extra + [dd, col, f"%{sval}%"]) 
            else:
                # unsupported op -> skip
                continue
        order_sql = ''
        ob = spec.get('order_by') or {}
        if isinstance(ob, dict) and ob.get('column') in columns:
            # JSONB order by cast text
            direction = 'DESC' if str(ob.get('direction','asc')).lower()=='desc' else 'ASC'
            order_sql = f" ORDER BY (data->>'{ob.get('column')}') {direction}"
        sql = "SELECT id, data FROM data_table_rows WHERE " + ' AND '.join(where_parts) + order_sql + " LIMIT %s"
        params.append(limit)
        with db_manager.get_connection() as conn:
            cur = conn.cursor()
            db_manager.exec(cur, sql, tuple(params))
            rows = cur.fetchall()
            for r in rows:
                payload = r[1]
                if isinstance(payload, (bytes, str)):
                    try:
                        import json as _json
                        payload = _json.loads(payload)
                    except Exception:
                        payload = {}
                rows_data.append(payload)
    else:
        # SQLite o nessuna condizione: filtra in Python
        all_rows = get_rows(table_id, limit=1_000_000, offset=0)
        MONTHS = {
            'gennaio':'01','febbraio':'02','marzo':'03','aprile':'04','maggio':'05','giugno':'06',
            'luglio':'07','agosto':'08','settembre':'09','ottobre':'10','novembre':'11','dicembre':'12'
        }
        def parse_date(s: str) -> Optional[datetime]:
            # prefer Italian D/M/Y first
            for fmt in ('%d/%m/%Y','%d-%m-%Y','%Y-%m-%d'):
                try:
                    return datetime.strptime(s, fmt)
                except Exception:
                    continue
            return None
        for r in all_rows:
            data = r.get('data') or {}
            ok = True
            for (col, op, val, typ) in conds:
                curv = str(data.get(col) or '')
                if op == 'equals':
                    if typ == 'date':
                        # format-insensitive: try parsed dates
                        try:
                            dcur = parse_date(curv); dval = parse_date(str(val or ''))
                            if not (dcur and dval and dcur == dval): ok=False; break
                        except Exception:
                            ok=False; break
                    elif typ == 'number':
                        try:
                            if float(curv) != float(val): ok=False; break
                        except Exception:
                            ok=False; break
                    else:
                        if curv != str(val or ''): ok = False; break
                elif op == 'contains':
                    if str(val or '').lower() not in curv.lower(): ok = False; break
                elif op in ('gte','lte','gt','lt'):
                    # try date then number
                    dcur = parse_date(curv)
                    dval = parse_date(str(val or ''))
                    if typ == 'date' or (dcur and dval):
                        if op=='gte' and not (dcur >= dval): ok=False; break
                        if op=='lte' and not (dcur <= dval): ok=False; break
                        if op=='gt' and not (dcur > dval): ok=False; break
                        if op=='lt' and not (dcur < dval): ok=False; break
                    else:
                        try:
                            fcur = float(curv); fval = float(val)
                            if op=='gte' and not (fcur >= fval): ok=False; break
                            if op=='lte' and not (fcur <= fval): ok=False; break
                            if op=='gt' and not (fcur > fval): ok=False; break
                            if op=='lt' and not (fcur < fval): ok=False; break
                        except Exception:
                            ok=False; break
                elif op == 'between':
                    v1, v2 = None, None
                    if isinstance(val, (list, tuple)) and len(val) >= 2:
                        v1, v2 = str(val[0]), str(val[1])
                    elif isinstance(val, dict):
                        v1, v2 = str(val.get('from','')), str(val.get('to',''))
                    dcur = parse_date(curv)
                    if v1 and v2:
                        # date first
                        d1, d2 = parse_date(v1), parse_date(v2)
                        if typ == 'date' or (dcur and d1 and d2):
                            if not (d1 <= dcur <= d2): ok=False; break
                        else:
                            try:
                                fcur = float(curv); f1 = float(v1); f2 = float(v2)
                                if not (f1 <= fcur <= f2): ok=False; break
                            except Exception:
                                ok=False; break
                elif op == 'month':
                    sval = str(val or '')
                    mm = MONTHS.get(sval.lower()) or (sval.zfill(2) if re.match(r'^\d{1,2}$', sval) else None)
                    dcur = parse_date(curv)
                    if typ == 'date' or dcur:
                        if mm and dcur.strftime('%m') != mm: ok=False; break
                    else:
                        if sval.lower() not in curv.lower(): ok=False; break
                elif op == 'weekday':
                    sval = str(val or '').lower()
                    DOW = { 'lunedi':0,'lunedì':0,'lun':0,'martedi':1,'martedì':1,'mar':1,'mercoledi':2,'mercoledì':2,'mer':2,
                            'giovedi':3,'giovedì':3,'gio':3,'venerdi':4,'venerdì':4,'ven':4,'sabato':5,'sab':5,'domenica':6,'dom':6 }
                    dcur = parse_date(curv)
                    if dcur:
                        want = DOW.get(sval)
                        if want is not None and dcur.weekday() != want: ok=False; break
                    else:
                        if sval not in curv.lower(): ok=False; break
                else:
                    ok=False; break
            if ok:
                rows_data.append(data)
            if len(rows_data) >= limit:
                break
    return columns, rows_data


def _format_rows_for_prompt(results: List[Dict[str, Any]], limit_per_table: int = 8) -> str:
    parts: List[str] = []
    for t in results:
        title = t.get("title") or t.get("table_name") or t.get("table_id")
        disp_cols = t.get("display_columns") or (t.get("columns") or [])[:5]
        rows = t.get("rows") or []
        if not disp_cols or not rows:
            continue
        header = " | ".join(disp_cols)
        lines = [f"[Tabella: {title}]", header]
        for r in rows[:limit_per_table]:
            data = r.get("data") or {}
            vals = [str((data.get(c) if data.get(c) is not None else '')).replace('\n',' ').strip() for c in disp_cols]
            lines.append(" | ".join(vals))
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


async def run_agent(user_query: str, table_results: List[Dict[str, Any]], table_ids: Optional[List[str]] = None) -> Optional[str]:
    """Esegue il sottoagente: sintetizza una risposta usando i risultati delle tabelle.

    Ritorna il testo oppure None se disabilitato o senza risultati.
    """
    # Se specificato, usa gli schemi dalle table_ids, altrimenti deduci da table_results
    use_table_ids = table_ids or list({t.get('table_id') for t in (table_results or []) if t.get('table_id')})
    if not use_table_ids:
        return None
    settings = get_settings()
    if not settings.get("enabled", True):
        return None
    provider = (settings.get("provider") or "openrouter").lower()
    model = settings.get("model")  # può essere None -> risolto da chat_with_provider
    temperature = float(settings.get("temperature") or 0.2)
    limit = int(settings.get("limit_per_table") or 8)

    # 1) Prompt: chiedi piani di query strutturate usando gli schemi
    schemas = _collect_schemas(use_table_ids)
    if not schemas:
        return None
    system = build_system_prompt()
    schema_text = _format_schemas_for_prompt(schemas)
    messages = [
        {"role": "system", "content": system},
        {"role": "user", "content": f"Domanda: {user_query}\n\nSchemi disponibili:\n{schema_text}\n\nRispondi SOLO con JSON come specificato (nessun testo extra)."},
    ]
    try:
        raw = await chat_with_provider(messages, provider=provider, model=model, temperature=temperature, context_hint="data_tables_agent")

        # ---- Parsing robusto del piano JSON ----
        import json as _json

        def _extract_json_list(s: str) -> List[Dict[str, Any]]:
            s = (s or '').strip()
            # 1) pura lista JSON
            try:
                obj = _json.loads(s)
                if isinstance(obj, list):
                    return obj  # type: ignore
                if isinstance(obj, dict):
                    # accetta chiavi comuni
                    for k in ('queries', 'plan', 'steps'):
                        if isinstance(obj.get(k), list):
                            return obj[k]  # type: ignore
                # altrimenti prosegui estrazione
            except Exception:
                pass
            # 2) blocco ```json ... ```
            m = re.search(r"```json\s*(\[.*?\])\s*```", s, flags=re.S)
            if m:
                try:
                    return _json.loads(m.group(1))
                except Exception:
                    pass
            # 3) prima '[' fino all'ultima ']'
            i1, i2 = s.find('['), s.rfind(']')
            if 0 <= i1 < i2:
                frag = s[i1:i2+1]
                try:
                    return _json.loads(frag)
                except Exception:
                    pass
            return []

        query_plan = _extract_json_list(raw)
        if not isinstance(query_plan, list):
            query_plan = []

        # ---- Fallback euristico se il piano è vuoto ----
        if not query_plan:
            # prova a dedurre mese/giorno-settimana e costruire condizioni
            MONTHS = {"gennaio":"01","febbraio":"02","marzo":"03","aprile":"04","maggio":"05","giugno":"06",
                      "luglio":"07","agosto":"08","settembre":"09","ottobre":"10","novembre":"11","dicembre":"12"}
            WEEKDAYS = { 'lunedì': 'lunedi', 'lunedi':'lunedi','lun':'lunedi',
                         'martedì':'martedi','martedi':'martedi','mar':'martedi',
                         'mercoledì':'mercoledi','mercoledi':'mercoledi','mer':'mercoledi',
                         'giovedì':'giovedi','giovedi':'giovedi','gio':'giovedi',
                         'venerdì':'venerdi','venerdi':'venerdi','ven':'venerdi',
                         'sabato':'sabato','sab':'sabato',
                         'domenica':'domenica','dom':'domenica' }
            ql = (user_query or '').lower()
            month_token = next((m for m in MONTHS if m in ql or m[:3] in ql), None)
            weekday_token = next((w for w in WEEKDAYS if w in ql), None)
            schemas_map = {s['table_id']: s for s in schemas}
            def pick_date_col(cols: List[str]) -> Optional[str]:
                cand = [c for c in cols if re.search(r"data|date|giorno", c, re.I)]
                return cand[0] if cand else (cols[0] if cols else None)
            for tid in use_table_ids:
                cols = (schemas_map.get(tid, {}).get('columns') or [])
                plan_spec: Dict[str, Any] = {"table_id": tid, "conditions": [], "limit": limit}
                if month_token:
                    dc = pick_date_col(cols)
                    if dc:
                        plan_spec['conditions'].append({"column": dc, "op": "month", "type": "date", "value": month_token})
                if weekday_token:
                    dc = pick_date_col(cols)
                    if dc:
                        plan_spec['conditions'].append({"column": dc, "op": "weekday", "type": "date", "value": weekday_token})
                # aggiungi filtro testuale generico su colonne comuni se presenti
                for pref in ("Titolo","Materia","Descrizione","Professore","Titoli","Course","Title"):
                    if pref in cols and 'lezion' in ql:
                        plan_spec['conditions'].append({"column": pref, "op": "contains", "value": "lezione"})
                        break
                if plan_spec['conditions']:
                    query_plan.append(plan_spec)

        # 2) Esegui piani (max 5)
        collected_blocks: List[str] = []
        for spec in query_plan[:5]:  # sicurezza: max 5 query
            if not isinstance(spec, dict):
                continue
            tid = spec.get('table_id')
            if tid not in use_table_ids:
                continue
            cols, rows = _execute_query_spec(tid, spec, limit_default=limit)
            if not rows:
                continue
            # format markdown table with up to 6 columns
            use_cols = cols[:6]
            header = "| " + " | ".join(use_cols) + " |\n|" + "|".join([" --- "]*len(use_cols)) + "|\n"
            body = []
            for r in rows:
                body.append("| " + " | ".join([str((r.get(c) if r.get(c) is not None else '')).replace('\n',' ') for c in use_cols]) + " |")
            block = f"[Tabella: {tid}]\n" + header + "\n".join(body)
            collected_blocks.append(block)

        # ---- Ulteriore fallback: usa i risultati di search_tables o cerca ora ----
        if not collected_blocks:
            # Se table_results è passato dalla chat, formatta; altrimenti prova una ricerca leggera
            formatted = _format_rows_for_prompt(table_results or [], limit_per_table=limit)
            if not formatted and use_table_ids:
                try:
                    srch = search_tables(user_query, use_table_ids, limit_per_table=limit)
                    formatted = _format_rows_for_prompt(srch.get('results') or [], limit_per_table=limit)
                except Exception:
                    formatted = ''
            if formatted:
                collected_blocks.append(formatted)

        if not collected_blocks:
            return None

        # 3) Sintesi finale usando i risultati
        final_system = (
            "Sei un assistente dati. Riceverai tabelle risultato (formato Markdown).\n"
            "- Rispondi in italiano, conciso.\n- NON inventare.\n- Cita date/orari se presenti.\n"
        )
        final_user = f"Domanda: {user_query}\n\nRisultati:\n\n" + "\n\n".join(collected_blocks)
        summary = await chat_with_provider([
            {"role": "system", "content": final_system},
            {"role": "user", "content": final_user}
        ], provider=provider, model=model, temperature=0.2, context_hint="data_tables_agent_summary")
        return (summary or '').strip()
    except Exception as e:
        print(f"[data-tables-agent] errore: {e}")
        return None

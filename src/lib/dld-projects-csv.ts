export type DldMarketProject = {
  key: string;
  projectNumber: string;
  name: string;
  developerName: string;
  areaName: string;
  status: string;
  projectType: string;
  completionDate: string;
  completedPct: number | null;
  totalUnits: number | null;
  masterProject: string;
  source: "Dubai Land Department";
};

function parseCsvRows(value: string) {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];
    if (quoted) {
      if (char === '"' && value[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
      continue;
    }
    if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field.trim());
      field = "";
    } else if (char === "\n") {
      row.push(field.trim());
      rows.push(row);
      row = [];
      field = "";
    } else if (char !== "\r") field += char;
  }
  if (field || row.length) {
    row.push(field.trim());
    rows.push(row);
  }
  return rows;
}

const headerAliases: Record<string, string[]> = {
  projectNumber: ["project_number", "project number", "project_id", "project id"],
  name: ["project_name", "project name", "name"],
  developerName: ["developer_name", "developer name", "master_developer_name"],
  areaName: ["area_name_en", "area_name", "area name", "area"],
  status: ["project_status", "project status", "status"],
  projectType: ["project_type", "project type", "type"],
  completionDate: ["completion_date", "completion date", "project_end_date", "end date"],
  completedPct: ["percent_completed", "completed (%)", "completed_pct", "completion percentage"],
  totalUnits: ["total_units", "total units", "no_of_units", "units"],
  masterProject: ["master_project_en", "master project", "master_project"],
};

function normalizedHeader(value: string) {
  return value.toLowerCase().replace(/^\ufeff/, "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function findColumn(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map(normalizedHeader);
  return headers.findIndex((header) => normalizedAliases.includes(normalizedHeader(header)));
}

function numberOrNull(value: string | undefined) {
  const parsed = Number(String(value ?? "").replace(/[% ,]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDldProjectsCsv(value: string): DldMarketProject[] {
  const rows = parseCsvRows(value);
  if (rows.length < 2) throw new Error("الملف لا يحتوي على صفوف بيانات.");
  const headers = rows[0];
  const columns = Object.fromEntries(
    Object.entries(headerAliases).map(([key, aliases]) => [key, findColumn(headers, aliases)]),
  ) as Record<keyof typeof headerAliases, number>;

  if (columns.name < 0) throw new Error("لم أجد عمود Project Name في الملف.");

  return rows.slice(1).flatMap((row, index) => {
    const get = (key: keyof typeof columns) => columns[key] >= 0 ? String(row[columns[key]] ?? "").trim() : "";
    const name = get("name");
    if (!name) return [];
    const projectNumber = get("projectNumber");
    return [{
      key: projectNumber || `${name}:${get("developerName")}:${index}`,
      projectNumber,
      name,
      developerName: get("developerName"),
      areaName: get("areaName"),
      status: get("status"),
      projectType: get("projectType"),
      completionDate: get("completionDate"),
      completedPct: numberOrNull(get("completedPct")),
      totalUnits: numberOrNull(get("totalUnits")),
      masterProject: get("masterProject"),
      source: "Dubai Land Department" as const,
    }];
  });
}

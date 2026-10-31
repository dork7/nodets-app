# Task planner and settings (`/v1/taskPlanner/*`, `/v1/settings/*`)

## What it does

A project timeline tracker. Each project has:

- a name, resources (people) and tags
- a priority and a status
- progress (0–100)
- start and end dates

`/v1/taskPlanner/dashboard` renders the timeline UI (`src/public/taskPlanner.ejs`). The lists of tags and resources the UI offers are managed through `/v1/settings`.

## Code

| File                                                               | Role                                                                          |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| `src/api/taskPlanner/taskPlannerRouter.ts` / `taskPlannerModel.ts` | Routes and Zod schemas                                                        |
| `src/api/taskPlanner/taskPlannerService.ts`                        | Date-order check, auto 100% progress when Done                                |
| `src/api/taskPlanner/taskPlannerRepository.ts`                     | Mongo access                                                                  |
| `src/models/taskPlanner.model.ts`                                  | Collection `taskPlanner`                                                      |
| `src/api/settings/*`                                               | Generic factory-built CRUD for `TagModel` and `ResourceModel` (unique `name`) |

## Endpoints

**Task planner**

| Method | Path                        | Input                                                                                                                          | Success                                                           |
| ------ | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------- |
| GET    | `/v1/taskPlanner/dashboard` | —                                                                                                                              | HTML                                                              |
| GET    | `/v1/taskPlanner`           | —                                                                                                                              | Projects whose status isn't `Deleted`, sorted by `startDate`      |
| GET    | `/v1/taskPlanner/:id`       | 24-hex ObjectId                                                                                                                | Project                                                           |
| POST   | `/v1/taskPlanner`           | `{ projectName, resources[≥1], tags?, priority: Low\|Medium\|High\|Critical, status?, progress? (0–100), startDate, endDate }` | 201, the project                                                  |
| PUT    | `/v1/taskPlanner/:id`       | Any subset of the fields above                                                                                                 | Project. `status: "Done"` without `progress` sets progress to 100 |
| DELETE | `/v1/taskPlanner/:id`       | —                                                                                                                              | `true`                                                            |

`status` is one of `Not Started`, `In Progress`, `Done` or `Deleted`.

**Settings**

| Method | Path                                                     | Input      | Success                                                |
| ------ | -------------------------------------------------------- | ---------- | ------------------------------------------------------ |
| GET    | `/v1/settings/tags` and `/v1/settings/resources`         | —          | `[{ id, name, createdAt, updatedAt }]`, sorted by name |
| POST   | same                                                     | `{ name }` | 201, the item                                          |
| DELETE | `/v1/settings/tags/:id` and `/v1/settings/resources/:id` | ObjectId   | `true`                                                 |

## Errors

| Status | Message                                                                                                                                                            | Cause                                                                                                                                                                                    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `Invalid input: params,id id must be a valid MongoDB ObjectId`                                                                                                     | Bad id                                                                                                                                                                                   |
| 400    | `Invalid input: body,projectName projectName is required` / `body,resources at least one resource is required` / `body,priority Invalid enum value…` / date errors | Invalid body                                                                                                                                                                             |
| 400    | `endDate must be on or after startDate`                                                                                                                            | Dates reversed on create, or on an update that sends **both** dates                                                                                                                      |
| 404    | `Project not found`                                                                                                                                                | Unknown id (get, update, delete)                                                                                                                                                         |
| 500    | `Cannot update project …: Validation failed: …` / `Cast to date failed …`                                                                                          | Mongoose validation or casting (`runValidators`). This is rare, because Zod checks first, but Zod's coerced values aren't written back to `req.body`, so Mongoose re-casts the raw input |
| 500    | `Error finding projects: …` / `Cannot create project: …`                                                                                                           | Mongo down                                                                                                                                                                               |
| 409    | `Tag already exists` / `Resource already exists`                                                                                                                   | Duplicate `name` (unique index)                                                                                                                                                          |
| 404    | `Tag not found` / `Resource not found`                                                                                                                             | Unknown id                                                                                                                                                                               |
| 500    | `Error finding Tags: …` / `Cannot create Resource: …`                                                                                                              | Mongo errors                                                                                                                                                                             |

## Known issues

- **Two meanings of delete.** `DELETE /:id` **hard-deletes**, even though the repository comment describes soft deletes. A soft delete only happens when a client sets `status: "Deleted"` with `PUT`.
- **`GET /:id` still returns soft-deleted projects.**
- **An update with only `endDate` can skip the date check.** It isn't compared with the stored `startDate`, so it can put the end before the start.
- **Removing a tag or resource doesn't touch projects.** Projects that reference it keep the name.
- **Failed responses include the raw error object** (the service passes `ex`), which exposes stack traces.

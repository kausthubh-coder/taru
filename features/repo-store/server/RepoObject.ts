// One Durable Object per repository ("<owner>/<repo>"). Holds refs and objects in SQLite,
// with large blobs in R2. Implements git-core's Repo contract.

import { DurableObject } from "cloudflare:workers";

export class RepoObject extends DurableObject<Env> {}

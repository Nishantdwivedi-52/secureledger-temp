// frontend/src/utils/api.js
import axios from "axios";

const client = axios.create({ baseURL: "/api" });

export const ping          = ()             => client.get("/ping");
export const getStats      = ()             => client.get("/stats");
export const getTopRisk    = (limit = 50)   => client.get(`/risk/top?limit=${limit}`);
export const getRings      = ()             => client.get("/rings");
export const getRing       = (id)           => client.get(`/rings/${id}`);
export const getEvidence   = (id)           => client.get(`/evidence/${id}`);
export const getAccount    = (id)           => client.get(`/account/${id}`);
export const getSubgraph   = (id, hops = 2) => client.get(`/account/${id}/subgraph?hops=${hops}`);

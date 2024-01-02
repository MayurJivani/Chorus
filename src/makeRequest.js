import axios from "axios";
const accessToken = localStorage.getItem('access_token');

export const makeRequest = axios.create({
    baseURL: import.meta.env.VITE_CHORUS_APP_API_URL,
    headers:{
        Authorization: `Bearer ${accessToken}`,
    },
});
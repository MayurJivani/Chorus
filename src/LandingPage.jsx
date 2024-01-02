import React, { useEffect, useState } from 'react';
import axios from 'axios';
import './App.css'
import { useNavigate } from 'react-router-dom';

function LandingPage() {
  const navigate = useNavigate();
  const handleLoginWithSpotify = () => {
    
    axios.get(import.meta.env.VITE_BACKEND_URL+'login')
      .then(response => {
        
        window.location.href = response.data.redirectUrl;
      })
      .catch(error => {
        console.error('Error initiating authentication flow:', error);
      });
  };
  

  useEffect(() => {
    
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');
    
    if (accessToken && refreshToken) {
      localStorage.setItem('access_token', accessToken);
      localStorage.setItem('refresh_token', refreshToken);
      navigate('/welcome');
    }

  }, []);

  return (
    <>
      <button onClick={handleLoginWithSpotify}>Login With Spotify</button>
    </>
  )
}

export default LandingPage

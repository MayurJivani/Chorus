import React, { useState, useEffect } from 'react';
import { makeRequest } from '../makeRequest';
import { Link } from 'react-router-dom';

const Search = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const [artistData, setArtistData] = useState([]);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery && searchQuery !== '') {
        const fetchData = async () => {
          try {
            const response = await makeRequest.get(`search?q=${searchQuery}&type=artist`);
            // Assuming the API response has an array of artists under "items"
            setArtistData(response.data.artists.items || []); // Initialize as an empty array
          } catch (error) {
            console.error('Error fetching data:', error);
          }
        };
        fetchData();
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Render the top 6 artist boxes
  const topArtists = artistData.slice(0, 6).map(artist => (
    <div key={artist.id} style={artistBoxStyle}>
      <img src={artist.images[0].url} alt={artist.name} style={artistImageStyle} />
      <div style={artistDetailsStyle}>
        <p>Name: {artist.name}</p>
        <p>Followers: {formatNumber(artist.followers.total)}</p>
        {/* Link to /play without passing artist details in the URL */}
        <Link to="/play" state={{ artistName: artist.name, artistId: artist.id }}>Play</Link>
      </div>
    </div>
  ));

  return (
    <>
      <div>Search</div>
      <input
        type='text'
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />
      <div style={searchResultsStyle}>{topArtists}</div>
    </>
  );
};

// Function to add commas to the followers count
const formatNumber = (number) => {
  return number.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
};

// Styles
const searchResultsStyle = {
  display: 'flex',
  flexWrap: 'wrap',
  justifyContent: 'space-around',
  margin: '20px',
};

const artistBoxStyle = {
  width: '300px',
  height: '400px',
  border: '2px solid #000',
  margin: '10px',
  padding: '10px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
};

const artistImageStyle = {
  width: '100%',
  height: 'auto',
};

const artistDetailsStyle = {
  marginTop: '10px',
  textAlign: 'center',
};

export default Search;

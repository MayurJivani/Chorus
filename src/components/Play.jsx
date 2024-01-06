import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import useFetch from '../hooks/useFetch';
import { makeRequest } from '../makeRequest';

function Play() {
  const location = useLocation();
  const { artistName, artistId } = location.state || {};
  const [albumsData, setAlbumsData] = useState([]);
  const [randomTrack, setRandomTrack] = useState(null); // State to store a random track
  const [isPlaying, setIsPlaying] = useState(false); // State to manage the play/pause state

  // Fetch albums and tracks data only if not present in local storage
  const storedAlbums = JSON.parse(localStorage.getItem('albums'));
  const storedTracks = JSON.parse(localStorage.getItem('tracks'));

  const { data: albums, loading: albumsLoading, error: albumsError } = useFetch(
    `/artists/${artistId}/albums?include_groups=album%2Csingle`,
    !storedAlbums
  );

  useEffect(() => {
    if (albums) {
      const filteredAlbums = albums.items.filter(album => !hasFilteredTerm(album.name));
      setAlbumsData(filteredAlbums);

      // Make a request for album details using album IDs
      const albumIds = filteredAlbums.map(album => album.id).join(',');
      const fetchAlbumDetails = async () => {
        try {
          const response = await makeRequest.get(`albums?ids=${albumIds}`);
          // Process the response for album details
          console.log('Album details:', response.data.albums);

          // Extract and filter tracks from the response
          const allTracks = response.data.albums
            .map(album => album.tracks.items)
            .flat()
            .filter(track => !hasFilteredTerm(track.name));

          // Pick a random track
          const randomIndex = Math.floor(Math.random() * allTracks.length);
          setRandomTrack(allTracks[randomIndex]);

          // Store albums and tracks in local storage
          localStorage.setItem('albums', JSON.stringify(filteredAlbums));
          localStorage.setItem('tracks', JSON.stringify(allTracks));
        } catch (error) {
          console.error('Error fetching album details:', error);
        }
      };

      fetchAlbumDetails();
    }
  }, [albums]);

  // Function to check if a string contains specific terms
  const hasFilteredTerm = (str) => {
    const termsToFilter = ['remix', 'acoustic', 'instrumental', 'mix'];
    return termsToFilter.some(term => str.toLowerCase().includes(term));
  };

  // Function to handle the play/pause state
  const handlePlayPause = () => {
    const audioElement = document.getElementById('audioElement');

    if (isPlaying) {
      // Pause and seek to the beginning
      audioElement.pause();
      audioElement.currentTime = 0;
    } else {
      // Play
      audioElement.play();
    }

    setIsPlaying(!isPlaying);
  };

  return (
    <div>
      <h2>Playing {artistName}'s Albums</h2>

      {albumsLoading && <p>Loading albums...</p>}
      {albumsError && <p>Error loading albums: {albumsError.message}</p>}

      {albumsData.length > 0 ? (
        <ul>
          {albumsData.map(album => (
            <li key={album.id}>
              <img src={album.images[0].url} alt={album.name} style={albumImageStyle} />
              <div style={albumDetailsStyle}>
                <p>{album.name}</p>
                <p>Release Date: {album.release_date}</p>
                <p>Total Tracks: {album.total_tracks}</p>
                <a href={album.external_urls.spotify} target="_blank" rel="noopener noreferrer">
                  Open on Spotify
                </a>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p>No albums without filtered terms found.</p>
      )}

      <h2>Random Track</h2>
      {randomTrack ? (
        <div>
          <p>{randomTrack.name}</p>
          {randomTrack.preview_url && (
            <div>
              <audio id="audioElement" controls={false} autoPlay={isPlaying}>
                <source src={randomTrack.preview_url} type="audio/mp3" />
                Your browser does not support the audio element.
              </audio>
              <button onClick={handlePlayPause}>{isPlaying ? 'Pause' : 'Play'}</button>
            </div>
          )}
        </div>
      ) : (
        <p>No random track found.</p>
      )}
    </div>
  );
}

// Styles
const albumImageStyle = {
  width: '100px',
  height: '100px',
  marginRight: '10px',
};

const trackImageStyle = {
  width: '50px',
  height: '50px',
  marginRight: '10px',
};

const albumDetailsStyle = {
  display: 'flex',
  flexDirection: 'column',
};

export default Play;

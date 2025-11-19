# Echo Flume

A fluid visualization application built with Vue 3 and WebGL.

## Overview

Echo Flume is a real-time fluid simulation that reacts to audio input. It features a self-propelling emitter that moves through a fluid medium, creating colorful, dynamic patterns.

## Features

- **Fluid Simulation**: Based on WebGL fluid dynamics.
- **Audio Reactivity**: Visuals respond to audio intensity.
- **Vue 3**: Built using Vue 3 ES modules (no build step required).
- **Tailwind CSS**: Styled for a clean, immersive experience.

## Running Locally

Since this project uses ES modules directly, you need a local static file server to run it (to avoid CORS issues with local file access).

1.  Start a local server in the project directory:

    ```bash
    # Python 3
    python3 -m http.server 8080
    ```

2.  Open your browser and navigate to `http://localhost:8080`.

## Deployment

This project is designed to be deployed directly to static hosting services like GitHub Pages without a build step.

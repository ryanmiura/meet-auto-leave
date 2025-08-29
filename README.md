# Meet Auto Leave

Chrome extension that automates your Google Meet experience. It enables automatic joining and leaving of meetings based on schedules, timers, or participant counts. Users can set links and times for auto-join, exit when participant numbers drop below a minimum or a percentage of the peak, send automatic chat messages ("Hello" on join, "See you" on exit), and mirror reactions when a set number of participants use the same emoji. Meet Auto Leave streamlines virtual meetings with a user-friendly interface and secure, minimal permissions.

## Project Structure

The extension follows a standard architecture for browser extensions, with a clear separation of concerns:

-   **`background`**: Handles background tasks, such as scheduling meeting entries and managing persistent state.
-   **`popup`**: Contains the UI and logic for the extension's popup window where users configure their settings.
-   **`content`**: This is the core logic that interacts directly with the Google Meet webpage. It is broken down into several modules for maintainability:
    -   `logger.js`: A utility for logging.
    -   `dom.js`: Handles all DOM querying and manipulation.
    -   `ui.js`: Manages the on-page UI elements created by the extension.
    -   `meet-logic.js`: Contains the primary logic for joining, leaving, and monitoring meetings.
    -   `main.js`: The main entry point that initializes and coordinates all other content modules.
-   **`utils`**: Contains shared utility scripts, such as the storage manager for the popup.
-   **`assets`**: Contains all static assets, like icons and images.

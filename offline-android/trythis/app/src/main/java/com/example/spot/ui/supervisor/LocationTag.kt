package com.example.spot.ui.supervisor

/**
 * Shared checkpoint model used by the supervisor mobile screens.
 *
 * The older mobile module used:
 *   lat / long / isRegistered
 *
 * The current web + Android integration uses:
 *   latitude / longitude
 *   lat / lng
 *   locationRegistered
 *
 * Keeping compatible fields here prevents the older assignment screens
 * from breaking while the QR placement screen uses the modern fields.
 */
data class LocationTag(
    val id: String = "",
    val name: String = "",

    // QR value currently printed for the checkpoint.
    val qrValue: String = "",

    // Legacy coordinates.
    val lat: Double? = null,
    val long: Double? = null,

    // Current longitude alias used by the web/mobile integration.
    val lng: Double? = null,

    // Current coordinate aliases.
    val latitude: Double? = null,
    val longitude: Double? = null,

    val isRegistered: Boolean = false,
    val locationRegistered: Boolean = false,

    val locationAccuracyMeters: Double? = null,
    val geofenceRadiusMeters: Double = 30.0
) {
    fun resolvedLatitude(): Double? =
        latitude ?: lat

    fun resolvedLongitude(): Double? =
        longitude ?: lng ?: long

    fun hasRegisteredLocation(): Boolean =
        (locationRegistered || isRegistered) &&
                resolvedLatitude() != null &&
                resolvedLongitude() != null
}

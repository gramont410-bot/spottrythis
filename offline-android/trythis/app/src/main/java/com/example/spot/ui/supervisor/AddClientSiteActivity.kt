package com.example.spot.ui.supervisor

import android.os.Bundle
import android.widget.EditText
import android.widget.ImageButton
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import com.example.spot.R
import com.google.android.material.button.MaterialButton
import com.google.firebase.firestore.FirebaseFirestore

class AddClientSiteActivity : AppCompatActivity() {

    private val db = FirebaseFirestore.getInstance()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_add_client_site)

        val btnBack = findViewById<ImageButton>(R.id.btnBack)
        val etSiteName = findViewById<EditText>(R.id.etSiteName)
        val btnSubmitSite = findViewById<MaterialButton>(R.id.btnSubmitSite)

        btnBack.setOnClickListener { finish() }

        btnSubmitSite.setOnClickListener {
            val siteName = etSiteName.text.toString().trim()

            if (siteName.isEmpty()) {
                etSiteName.error = "Site name is required"
                return@setOnClickListener
            }

            deploySiteToFirestore(siteName)
        }
    }

    private fun deploySiteToFirestore(name: String) {
        // Reference to the client_sites collection
        val sitesCollection = db.collection("client_sites")

        // Generate a new document reference to get a clean unique ID
        val newSiteRef = sitesCollection.document()

        // Create the data object matching ClientSiteModel parameters
        val newSite = ClientSiteModel(
            siteId = newSiteRef.id,
            siteName = name
        )

        // Upload to Firestore
        newSiteRef.set(newSite)
            .addOnSuccessListener {
                Toast.makeText(this, "$name deployed successfully!", Toast.LENGTH_SHORT).show()
                finish() // Closes this screen and goes back to dashboard
            }
            .addOnFailureListener { e ->
                Toast.makeText(this, "Deployment failed: ${e.localizedMessage}", Toast.LENGTH_LONG).show()
            }
    }
}